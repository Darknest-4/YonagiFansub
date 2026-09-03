'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Play, SkipForward, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { PlayerControls } from '@/features/video/player/controls';
import { SettingsSheet } from '@/features/video/player/settings-sheet';
import {
  supportsPictureInPicture,
  useMediaState,
} from '@/features/video/player/use-media-state';
import {
  SEEK_STEP_SEC,
  VOLUME_STEP,
  isTypingTarget,
  resolveAction,
} from '@/features/video/player/keyboard';
import {
  autoNextRemaining,
  bufferedAhead,
  formatTime,
  isMarkerActive,
  nextRate,
  type PlaybackRate,
} from '@/features/video/player/timeline';
import type { QualityStep } from '@/features/video/resolver';

/**
 * A Yonagi lejátszó.
 *
 * ## Mit véd, és mit nem
 *
 * Saját kiszolgálású forrásnál a videóelem Media Source Extensionsön keresztül
 * kapja az adatot, tehát a `src` egy fülhöz kötött `blob:` cím. Nincs
 * médiaURL a DOM-ban, és minden mögöttes kérés aláírt, nézőhöz kötött, egy
 * percen belül lejár.
 *
 * Harmadik feles forrásnál nincs mit rejteni: a fájl az ő szerverükön van. Amit
 * teszünk, az az elzárás — a szolgáltató lejátszója a `/beagyazas/[id]` alatt
 * fut, saját, egyetlen hosztot megnevező szabállyal, felugrók és kinavigálás
 * ellen elzárva.
 *
 * **Egyik sem teszi letölthetetlenné a videót.** Amit a böngésző dekódol, az a
 * gépen van; ezen csak DRM változtat. A cél az olcsó utak lezárása.
 *
 * ## A felépítés
 *
 * A fájl a **vezénylés**: mit tölt be, mikor vált forrást, mi látszik. A
 * részletek külön laknak — az időlogika a `timeline.ts`-ben, a billentyűk a
 * `keyboard.ts`-ben, a médiaelem állapota a `use-media-state.ts`-ben, a
 * vezérlők és a beállítások saját komponensben. Ez nem stílus kérdése: ezek a
 * részek külön tesztelhetők, és nézés közben futnak, ahol a hibát nehéz elkapni.
 */

export interface PlayerSource {
  sourceId: string;
  quality: QualityStep;
  label: string;
  providerName: string | null;
  isAdaptive: boolean;
}

export interface PlayerSubtitle {
  id: string;
  label: string;
  language: string;
  format: string;
  url: string;
}

export interface PlayerManifest {
  episodeId: string;
  title: string;
  durationSec: number | null;
  posterUrl: string | null;
  chain: PlayerSource[];
  availableQualities: QualityStep[];
  resolvedQuality: QualityStep | null;
  markers: {
    introStartSec: number | null;
    introEndSec: number | null;
    outroStartSec: number | null;
    outroEndSec: number | null;
  };
  subtitles: PlayerSubtitle[];
  previousEpisode: { href: string; number: string } | null;
  nextEpisode: { href: string; number: string } | null;
  resumeAtSec: number | null;
}

interface PlaybackPlan {
  mode: 'hls-proxy' | 'file-proxy' | 'isolated';
  url: string;
  expiresIn: number;
  title: string;
  durationSec: number | null;
  allowPopups: boolean;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

/** A CSRF sütijét a middleware állítja be; a `shared/api/client` ugyanezt olvassa. */
function readCsrf(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?yonagi_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Nézőnkénti apróságok. Sosem végzetes, ha a tároló tiltva van. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(`yonagi:player:${key}`);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(`yonagi:player:${key}`, value);
  } catch {
    // Privát ablak vagy letiltott sütik: a lejátszó ettől még működik.
  }
}

export function VideoPlayer({
  manifest,
  trackProgress = false,
  onTheaterChange,
  className,
}: {
  manifest: PlayerManifest;
  /** Csak bejelentkezett nézőnél: van hova menteni. */
  trackProgress?: boolean;
  /** Az oldal ebből tudja, mikor tágítsa ki a keretet. */
  onTheaterChange?: (theater: boolean) => void;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const destroyRef = useRef<(() => void) | null>(null);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  /** Amit épp mondunk a nézőnek forrásváltás közben. */
  const [notice, setNotice] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setFullscreen] = useState(false);
  const [isTheater, setTheater] = useState(false);
  const [quality, setQuality] = useState<QualityStep | 'AUTO'>('AUTO');
  const [subtitleId, setSubtitleId] = useState<string | null>(null);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [skipIntroEnabled, setSkipIntroEnabled] = useState(true);
  const [autoNextCancelled, setAutoNextCancelled] = useState(false);

  const current = manifest.chain[index];
  const { state, controls } = useMediaState(videoRef, current?.sourceId ?? null);

  // Mentett beállítások betöltése egyszer.
  useEffect(() => {
    setAutoplayNext(readStored('autoplay') !== 'off');
    setSkipIntroEnabled(readStored('skipIntro') !== 'off');

    const preferred = manifest.subtitles.find((track) => track.id === readStored('subtitle'));
    setSubtitleId(preferred?.id ?? manifest.subtitles[0]?.id ?? null);
  }, [manifest.subtitles]);

  const teardown = useCallback(() => {
    destroyRef.current?.();
    destroyRef.current = null;
    setPlan(null);
  }, []);

  useEffect(() => teardown, [teardown]);

  /*
    Haladás mentése.

    Harminc másodpercenként, és nem gyakrabban: ennél sűrűbben írni annyit
    jelentene, hogy egy órányi film alatt százszor kérünk a szervertől valamit,
    amiből egyszer is elég lenne.

    A `keepalive` a lapzárásra való. Enélkül a böngésző eldobja a még futó kérést,
    amikor a lap eltűnik — vagyis pont az utolsó, legpontosabb pozíció veszne el.
    A `sendBeacon` ugyanezt tudná, de nem enged saját fejlécet, a CSRF-token
    viszont fejlécben megy.

    A `pagehide` és nem a `beforeunload`: utóbbi mobilon jellemzően el sem sül,
    mert a lapot a rendszer a háttérből dobja el.

    Beágyazott forrásnál nincs mit menteni: a lejátszás idegen keretben zajlik,
    aminek a pozícióját nem látjuk. Ilyenkor a néző inkább semmilyen jelölést ne
    kapjon, mint hamisat.
  */
  useEffect(() => {
    if (!trackProgress) return;

    const video = videoRef.current;
    if (!video || plan?.mode === 'isolated') return;

    let lastSent = 0;

    const send = () => {
      if (!Number.isFinite(video.currentTime) || video.currentTime < 5) return;
      lastSent = video.currentTime;

      const csrf = readCsrf();
      void fetch(`/api/v1/watch-progress/${manifest.episodeId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          positionSec: Math.round(video.currentTime),
          durationSec: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const onTimeUpdate = () => {
      if (video.currentTime - lastSent >= 30) send();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', send);
    video.addEventListener('ended', send);
    window.addEventListener('pagehide', send);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('pause', send);
      video.removeEventListener('ended', send);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [manifest.episodeId, trackProgress, plan?.mode]);

  /**
   * Váltás a következő olyan forrásra, ami még nem bukott el.
   *
   * A pozíciót megőrizzük: aki huszonhárom percnél tart, ne kezdje elölről csak
   * azért, mert egy tárhely elhalt.
   */
  const failover = useCallback(
    (reason: string) => {
      if (!current) return;

      const keepAt = videoRef.current?.currentTime ?? 0;
      const exhausted = new Set(failed).add(current.sourceId);
      setFailed(exhausted);

      const next = manifest.chain.findIndex((source) => !exhausted.has(source.sourceId));
      if (next === -1) {
        setPhase('error');
        setError(
          manifest.chain.length > 1
            ? 'Ez a videó jelenleg nem érhető el. Próbáld meg később.'
            : reason,
        );
        return;
      }

      const target = manifest.chain[next]!;
      setNotice(
        target.quality === current.quality
          ? 'Videóforrás váltása…'
          : `${current.quality} forrás nem elérhető, váltás ${target.quality}-re…`,
      );

      teardown();
      setIndex(next);
      setPhase('idle');
      setError(null);
      resumeRef.current = keepAt;
    },
    [current, failed, manifest.chain, teardown],
  );

  /** Hol folytassuk — folytatásból vagy forrásváltásból. */
  const resumeRef = useRef<number>(manifest.resumeAtSec ?? 0);

  /*
    Induljon-e el magától, amint betöltött.

    Korábban a natív vezérlősáv volt kirajzolva, tehát a néző ott nyomott
    lejátszást — a betöltés után nem kellett semmit tenni. Saját vezérlőkkel ez
    a lépés a miénk: aki a nagy lejátszás gombra kattintott, az **el akarja
    indítani**, nem betölteni. A jelzés `ref`-ben van és nem state-ben, mert a
    betöltés aszinkron, és egy közben történő újrarajzolás nem írhatja felül.
  */
  const autoplayRef = useRef(false);

  const beginPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !autoplayRef.current) return;
    autoplayRef.current = false;
    // A `play()` elutasíthat (a böngésző tilthatja a hangos automatikus
    // lejátszást). Nem hiba: a néző ott van, és a gomb kéznél van.
    void video.play().catch(() => undefined);
  }, []);

  const start = useCallback(
    async (source: PlayerSource) => {
      setPhase('loading');
      setError(null);

      let loaded: PlaybackPlan;
      try {
        const response = await fetch(`/api/v1/watch/${source.sourceId}/manifest`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? 'A lejátszás nem indítható.');
        }

        loaded = ((await response.json()) as { data: PlaybackPlan }).data;
      } catch (caught) {
        failover(caught instanceof Error ? caught.message : 'A lejátszás nem indítható.');
        return;
      }

      setPlan(loaded);
      setNotice(null);

      // Harmadik feles forrás a saját keretében játszik; nincs mit ráakasztani.
      if (loaded.mode === 'isolated') {
        setPhase('ready');
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      /*
        Folytatás onnan, ahol abbahagyta.

        A `loadedmetadata` bevárása nem díszítés: a `currentTime` beállítása
        addig, amíg a lejátszó nem tudja a hosszt, csendben elveszik.
      */
      const resumeAt = resumeRef.current;
      const resume = () => {
        if (resumeAt > 5 && Number.isFinite(video.duration) && resumeAt < video.duration - 10) {
          video.currentTime = resumeAt;
        }
      };
      video.addEventListener('loadedmetadata', resume, { once: true });

      if (loaded.mode === 'file-proxy') {
        video.src = loaded.url;
        setPhase('ready');
        video.addEventListener('loadeddata', beginPlayback, { once: true });
        return;
      }

      // A Safari natívan játssza a HLS-t, és MSE-t nem tud rá használni. A
      // lejátszási lista így is aláírt és lejár; csak a blob-közvetítés marad
      // el, ami platformkorlát, nem döntés.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = loaded.url;
        setPhase('ready');
        video.addEventListener('loadeddata', beginPlayback, { once: true });
        return;
      }

      try {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) throw new Error('Ez a böngésző nem támogatja a lejátszást.');

        const hls = new Hls({
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 60,
        });

        /*
          Helyreállítás, korláttal.

          Az első változat minden végzetes hálózati hibára újrapróbált — a
          gyakori esetre helyesen (lejárt token szünet közben), mindenre másra
          rosszul. A hls.js az értelmezhetetlen lejátszási listát is *hálózati*
          hibaként jelenti, és a `startLoad()` egy értelmezett manifest nélküli
          munkameneten semmit nem csinál: se kérés, se esemény, se üzenet. A
          lejátszó örökre a „Betöltés…”-en ült, a napló pedig üres volt, mert
          semmi nem hibázott hangosan.

          Ezért minden helyreállításnak kerete van. Azon túl a forrás halottnak
          számít, és a váltás továbblép — ez az őszinte kimenet, és ez az, ami a
          nézőt működő forráshoz juttatja pörgő ikon helyett.
        */
        let networkRetries = 0;
        let mediaRetries = 0;

        /*
          Utolsó védvonal: az a forrás, ami se nem indul, se nem hibázik.

          Minden eddig látott elakadásnak megvolt a maga oka, és mindegyik
          megkapta a maga kezelését — de a nézőnek mindegyik ugyanaz: pörgő ikon,
          ami sosem áll meg. Az őrkutya bármelyik jövőbeli változatot rendes
          forrásváltássá teszi, anélkül hogy előre ki kellene találni az okát.
        */
        let settled = false;
        const watchdog = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          hls.destroy();
          failover('A forrás nem válaszol.');
        }, 20_000);

        const finish = (): void => {
          settled = true;
          window.clearTimeout(watchdog);
        };

        hls.on(Hls.Events.ERROR, (_event, payload) => {
          if (!payload.fatal || settled) return;

          /*
            Amit a böngésző nem tud dekódolni, az nem átmeneti hiba, és a
            `recoverMediaError()` nem varázsol dekódert — az újrapróbálás csak
            egy világos problémából csinál pörgő ikont.
          */
          if (
            payload.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR ||
            payload.details === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR
          ) {
            finish();
            hls.destroy();
            failover('Ez a böngésző nem tudja lejátszani ezt a videót (hiányzó H.264/AAC kodek).');
            return;
          }

          /*
            A végleges HTTP-válaszokat nem próbáljuk újra.

            A hls.js minden hálózati bajt `NETWORK_ERROR`-nak jelent, a 404 is az
            — csakhogy a 404 nem átmeneti: a fájl nincs ott, és háromszor
            megkérdezni ugyanazt ugyanazt a választ adja. Ez a böngészős próbán
            derült ki: a lánc végigfutott ugyan, de a néző **negyvenöt
            másodpercig** nézett egy pörgő ikont, amiből harminc a fölösleges
            újrapróbálásokra ment el.

            A 401 és a 403 lejárt vagy érvénytelen tokent jelent — azon egy
            újratöltés segít, egy újrapróbálás nem. A 410 kimondottan „elment".
          */
          const status = payload.response?.code ?? 0;
          const definitive = status === 404 || status === 401 || status === 403 || status === 410;

          if (payload.type === Hls.ErrorTypes.NETWORK_ERROR && !definitive && networkRetries < 3) {
            networkRetries += 1;
            setNotice('Újracsatlakozás…');
            hls.startLoad();
            return;
          }
          if (payload.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
            mediaRetries += 1;
            hls.recoverMediaError();
            return;
          }

          finish();
          hls.destroy();
          failover(`A lejátszás megszakadt (${payload.details}).`);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          finish();
          setNotice(null);
          setPhase('ready');
          beginPlayback();

          /*
            Második őrkutya: a lejátszási lista megvan, de adat sosem jön.

            Az elsőt itt leállítjuk, mert a manifest megérkezett — csakhogy a
            hiba a *következő* lépésben is megtörténhet, és ott csendben. Amikor
            a böngészőből hiányzik a kodek, a `MediaSource` egyszerűen nem fogad
            el egyetlen puffert sem: nincs végzetes hls.js hiba, nincs `error`
            esemény a videóelemen, a `readyState` nulla marad. A lejátszó ilyenkor
            pörög — pontosan az a kimenet, amit az első őrkutya megelőzni hivatott.

            Ezért a manifest után újabb, rövidebb figyelés indul, és azt nézi,
            ami a nézőt érdekli: került-e egyáltalán adat a pufferbe. Ha nem, a
            forrás halott, és a váltás lép.
          */
          /*
            Saját jelző, nem a `settled`.

            Azt a manifest megérkezése már igazra állította — arra hivatkozni itt
            azt jelentené, hogy ez az őrkutya sosem sül el. (Pontosan ez volt az
            első változat hibája, és a böngészős próbán bukott ki: a lejátszó
            csendben pörgött tovább.)
          */
          let buffered = false;
          const bufferWatchdog = window.setTimeout(() => {
            if (buffered) return;
            const element = videoRef.current;
            if (element && (element.buffered.length > 0 || element.readyState >= 2)) return;

            buffered = true;
            hls.destroy();

            // A kodek a leggyakoribb ok, és a legfontosabb kimondani: „nem megy”
            // hozzánk küldi a nézőt, a „hiányzik a H.264” egy működő böngészőhöz.
            const codecMissing =
              typeof MediaSource !== 'undefined' &&
              !MediaSource.isTypeSupported('video/mp4; codecs=\"avc1.42E01E\"');

            failover(
              codecMissing
                ? 'Ez a böngésző nem tudja lejátszani ezt a videót (hiányzó H.264/AAC kodek).'
                : 'A forrás nem küld adatot.',
            );
          }, 12_000);

          const stopBufferWatchdog = () => {
            buffered = true;
            window.clearTimeout(bufferWatchdog);
          };
          hls.on(Hls.Events.FRAG_BUFFERED, stopBufferWatchdog);

          const previousDestroy = destroyRef.current;
          destroyRef.current = () => {
            stopBufferWatchdog();
            previousDestroy?.();
          };
        });

        hls.loadSource(loaded.url);
        hls.attachMedia(video);

        destroyRef.current = () => {
          finish();
          hls.destroy();
        };
      } catch (caught) {
        failover(caught instanceof Error ? caught.message : 'A lejátszás nem indítható.');
      }
    },
    [failover, beginPlayback],
  );

  /*
    Forrásváltás után magától indul újra.

    Aki nézett valamit, és a forrás elhalt, nem akar újra a lejátszás gombra
    kattintani — a váltásnak észrevétlennek kell lennie, amennyire lehet.
  */
  useEffect(() => {
    if (phase !== 'idle' || !current || failed.size === 0) return;
    // Váltás után folytatjuk: a néző nézett valamit, nem most kezdi.
    autoplayRef.current = true;
    void start(current);
  }, [phase, current, failed.size, start]);

  // ── Teljes képernyő ────────────────────────────────────────────────────────

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    /*
      iOS-en a `<video>` elem saját teljes képernyője az egyetlen működő út: a
      Safari iPhone-on nem enged tetszőleges elemet teljes képernyőre. Ilyenkor a
      natív lejátszó veszi át — a mi vezérlőink eltűnnek, de a néző legalább
      teljes képernyőn lát.
    */
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;

    if (!shell.requestFullscreen && video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    void shell.requestFullscreen?.().catch(() => undefined);
  }, []);

  const toggleTheater = useCallback(() => {
    setTheater((previous) => {
      const next = !previous;
      onTheaterChange?.(next);
      return next;
    });
  }, [onTheaterChange]);

  // ── Gyorsbillentyűk ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'ready' || plan?.mode === 'isolated') return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Ha valaki gépel, a billentyű az övé. Egy lejátszó, ami elnyeli a
      // szóközt egy hozzászólás közepén, használhatatlan.
      if (isTypingTarget(event.target as HTMLElement | null)) return;

      const action = resolveAction(event);
      if (!action) return;

      event.preventDefault();
      setControlsVisible(true);

      switch (action) {
        case 'toggle-play':
          controls.togglePlay();
          break;
        case 'seek-back':
          controls.seekBy(-SEEK_STEP_SEC);
          break;
        case 'seek-forward':
          controls.seekBy(SEEK_STEP_SEC);
          break;
        case 'volume-up':
          controls.adjustVolume(VOLUME_STEP);
          break;
        case 'volume-down':
          controls.adjustVolume(-VOLUME_STEP);
          break;
        case 'toggle-mute':
          controls.toggleMute();
          break;
        case 'toggle-fullscreen':
          toggleFullscreen();
          break;
        case 'toggle-pip':
          controls.togglePictureInPicture();
          break;
        case 'toggle-subtitles':
          setSubtitleId((previous) =>
            previous ? null : (manifest.subtitles[0]?.id ?? null),
          );
          break;
        case 'toggle-theater':
          toggleTheater();
          break;
        case 'rate-up':
          controls.setRate(nextRate(state.rate, 1));
          break;
        case 'rate-down':
          controls.setRate(nextRate(state.rate, -1));
          break;
        case 'seek-start':
          controls.seekTo(0);
          break;
        case 'seek-end':
          controls.seekTo(state.durationSec);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    plan?.mode,
    controls,
    state.rate,
    state.durationSec,
    manifest.subtitles,
    toggleFullscreen,
    toggleTheater,
  ]);

  // ── A vezérlők elrejtése ───────────────────────────────────────────────────

  const hideTimer = useRef<number | null>(null);

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      // Szünetben nem tűnnek el: aki megállította, valószínűleg épp a
      // vezérlőkkel akar csinálni valamit.
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // ── Érintés: dupla koppintás tekeréshez ────────────────────────────────────

  const lastTap = useRef<{ time: number; x: number } | null>(null);
  const [tapHint, setTapHint] = useState<'back' | 'forward' | null>(null);

  const onSurfaceTap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    const now = Date.now();
    const previous = lastTap.current;
    lastTap.current = { time: now, x: event.clientX };

    // Két koppintás 300 ms-en belül, nagyjából ugyanott: tekerés.
    if (previous && now - previous.time < 300 && Math.abs(previous.x - event.clientX) < 60) {
      const rect = event.currentTarget.getBoundingClientRect();
      const forward = event.clientX - rect.left > rect.width / 2;

      controls.seekBy(forward ? SEEK_STEP_SEC * 2 : -SEEK_STEP_SEC * 2);
      setTapHint(forward ? 'forward' : 'back');
      window.setTimeout(() => setTapHint(null), 500);

      lastTap.current = null;
      return;
    }

    // Egyszeri koppintás: vezérlők ki/be.
    setControlsVisible((visible) => !visible);
  };

  // ── Főcím és következő rész ────────────────────────────────────────────────

  const showSkipIntro =
    skipIntroEnabled &&
    phase === 'ready' &&
    isMarkerActive(
      { startSec: manifest.markers.introStartSec, endSec: manifest.markers.introEndSec },
      state.currentSec,
    );

  const showSkipOutro =
    phase === 'ready' &&
    isMarkerActive(
      { startSec: manifest.markers.outroStartSec, endSec: manifest.markers.outroEndSec },
      state.currentSec,
    );

  const countdown =
    autoplayNext && !autoNextCancelled && manifest.nextEpisode && phase === 'ready'
      ? autoNextRemaining(
          state.currentSec,
          state.durationSec,
          manifest.markers.outroStartSec,
        )
      : null;

  useEffect(() => {
    if (countdown === 0 && manifest.nextEpisode) {
      window.location.href = manifest.nextEpisode.href;
    }
  }, [countdown, manifest.nextEpisode]);

  if (manifest.chain.length === 0 || !current) {
    return (
      <div
        className={cn(
          'grid aspect-video w-full place-items-center rounded-xl border border-ink-800 bg-ink-950 p-6 text-center',
          className,
        )}
      >
        <div>
          <AlertTriangle className="mx-auto size-6 text-ember-400" aria-hidden />
          <p className="mt-2 text-sm text-mist-200">Ez a videó jelenleg nem érhető el.</p>
          <p className="mt-1 text-2xs text-mist-500">
            Dolgozunk rajta — nézz vissza később.
          </p>
        </div>
      </div>
    );
  }

  const activeSubtitle = manifest.subtitles.find((track) => track.id === subtitleId) ?? null;

  return (
    <div
      ref={shellRef}
      onPointerMove={wakeControls}
      onPointerLeave={() => state.isPlaying && setControlsVisible(false)}
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-xl border border-ink-800 bg-black',
        isFullscreen && 'rounded-none border-0',
        !controlsVisible && state.isPlaying && 'cursor-none',
        className,
      )}
    >
      {plan?.mode === 'isolated' ? (
        <iframe
          key={plan.url}
          src={plan.url}
          title={plan.title}
          allow="fullscreen; encrypted-media"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="size-full"
        />
      ) : (
        <>
          <video
            ref={videoRef}
            poster={manifest.posterUrl ?? undefined}
            playsInline
            // Elrejti a letöltés menüpontot. Udvariasság, nem védelem.
            controlsList="nodownload noremoteplayback"
            onContextMenu={(event) => event.preventDefault()}
            onError={() => phase === 'ready' && failover('A lejátszás megszakadt.')}
            className="size-full bg-black"
          >
            {activeSubtitle && activeSubtitle.format === 'VTT' && (
              <track
                key={activeSubtitle.id}
                kind="subtitles"
                src={activeSubtitle.url}
                srcLang={activeSubtitle.language}
                label={activeSubtitle.label}
                default
              />
            )}
          </video>

          {/* Koppintási felület — a vezérlők alatt, a videó fölött. */}
          <div
            onPointerUp={onSurfaceTap}
            onDoubleClick={toggleFullscreen}
            onClick={(event) => {
              // Egérrel: kattintás a képre lejátszás/szünet, ahogy megszokott.
              if ((event as unknown as PointerEvent).pointerType === 'touch') return;
              if (phase === 'ready') controls.togglePlay();
            }}
            className="absolute inset-0"
            aria-hidden
          />

          {tapHint && (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white',
                tapHint === 'back' ? 'left-8' : 'right-8',
              )}
            >
              {tapHint === 'back' ? '−' : '+'}
              {SEEK_STEP_SEC * 2} mp
            </div>
          )}
        </>
      )}

      {/* ── Rétegek a videó fölött ── */}

      {phase === 'idle' && failed.size === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/60 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={() => {
              autoplayRef.current = true;
              void start(current);
            }}
            className="group flex flex-col items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom-400"
          >
            <span className="grid size-16 place-items-center rounded-full bg-bloom-500 text-white shadow-glow-bloom transition-transform duration-base group-hover:scale-105 motion-reduce:group-hover:scale-100 sm:size-20">
              <Play className="ml-1 size-7 fill-current sm:size-9" aria-hidden />
            </span>
            <span className="text-sm font-medium text-mist-100">
              {manifest.resumeAtSec && manifest.resumeAtSec > 5
                ? `Folytatás innen: ${formatTime(manifest.resumeAtSec, manifest.durationSec ?? undefined)}`
                : 'Lejátszás'}
            </span>
          </button>
        </div>
      )}

      {(phase === 'loading' || state.isBuffering || notice) && phase !== 'error' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-mist-100">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {notice ?? 'Betöltés…'}
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto size-6 text-ember-400" aria-hidden />
            <p className="mt-2 text-sm text-mist-200">{error}</p>
            <button
              type="button"
              onClick={() => {
                setFailed(new Set());
                setPhase('idle');
                setError(null);
              }}
              className="mt-3 min-h-11 text-2xs text-bloom-300 underline-offset-4 hover:underline"
            >
              Újrapróbálás
            </button>
          </div>
        </div>
      )}

      {/* Főcím átugrása */}
      {(showSkipIntro || showSkipOutro) && (
        <button
          type="button"
          onClick={() =>
            controls.seekTo(
              (showSkipIntro ? manifest.markers.introEndSec : manifest.markers.outroEndSec) ?? 0,
            )
          }
          className="absolute right-3 bottom-20 z-10 flex min-h-11 items-center gap-2 rounded-lg border border-white/25 bg-black/70 px-4 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-fast hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
        >
          <SkipForward className="size-4" aria-hidden />
          {showSkipIntro ? 'Főcím átugrása' : 'Végefőcím átugrása'}
        </button>
      )}

      {/* Következő rész visszaszámlálás */}
      {countdown !== null && countdown > 0 && manifest.nextEpisode && (
        <div className="absolute right-3 bottom-20 z-10 flex items-center gap-2 rounded-lg border border-white/25 bg-black/80 py-1 pr-1 pl-4 backdrop-blur-sm">
          <a
            href={manifest.nextEpisode.href}
            className="flex min-h-11 items-center text-sm font-medium text-white"
          >
            Következő rész {countdown} mp múlva
          </a>
          <button
            type="button"
            onClick={() => setAutoNextCancelled(true)}
            aria-label="Mégsem"
            className="grid size-11 place-items-center rounded-lg text-mist-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-bloom-400"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          qualities={manifest.availableQualities}
          quality={quality}
          resolvedQuality={current.quality}
          onQuality={(value) => {
            setQuality(value);
            const target = manifest.chain.findIndex(
              (source) => value === 'AUTO' || source.quality === value,
            );
            if (target !== -1 && target !== index) {
              resumeRef.current = videoRef.current?.currentTime ?? 0;
              teardown();
              setIndex(target);
              setPhase('idle');
              setFailed(new Set(['__forced__']));
            }
          }}
          rate={state.rate}
          onRate={(value: PlaybackRate) => controls.setRate(value)}
          subtitles={manifest.subtitles}
          activeSubtitleId={subtitleId}
          onSubtitle={(id) => {
            setSubtitleId(id);
            writeStored('subtitle', id ?? '');
          }}
          autoplayNext={autoplayNext}
          onAutoplayNext={(value) => {
            setAutoplayNext(value);
            writeStored('autoplay', value ? 'on' : 'off');
          }}
          skipIntro={skipIntroEnabled}
          onSkipIntro={(value) => {
            setSkipIntroEnabled(value);
            writeStored('skipIntro', value ? 'on' : 'off');
          }}
          sources={manifest.chain.map((source) => ({
            id: source.sourceId,
            label: source.label,
            providerName: source.providerName,
          }))}
          activeSourceId={current.sourceId}
          onSource={(id) => {
            const target = manifest.chain.findIndex((source) => source.sourceId === id);
            if (target === -1 || target === index) return;
            resumeRef.current = videoRef.current?.currentTime ?? 0;
            teardown();
            setIndex(target);
            setPhase('idle');
            setFailed(new Set(['__forced__']));
          }}
        />
      )}

      {/* Vezérlősáv — beágyazott forrásnál nincs, azt a szolgáltató adja. */}
      {plan?.mode !== 'isolated' && phase === 'ready' && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 transition-opacity duration-base',
            controlsVisible || !state.isPlaying
              ? 'opacity-100'
              : 'pointer-events-none opacity-0',
          )}
        >
          <PlayerControls
            isPlaying={state.isPlaying}
            currentSec={state.currentSec}
            durationSec={state.durationSec || (manifest.durationSec ?? 0)}
            bufferedAheadSec={bufferedAhead(state.bufferedRanges, state.currentSec)}
            volume={state.volume}
            isMuted={state.isMuted}
            rate={state.rate}
            isFullscreen={isFullscreen}
            isTheater={isTheater}
            isPictureInPicture={state.isPictureInPicture}
            canPictureInPicture={supportsPictureInPicture()}
            hasSubtitles={manifest.subtitles.length > 0}
            subtitlesOn={subtitleId !== null}
            onTogglePlay={controls.togglePlay}
            onSeek={controls.seekTo}
            onVolume={controls.setVolume}
            onToggleMute={controls.toggleMute}
            onToggleFullscreen={toggleFullscreen}
            onToggleTheater={toggleTheater}
            onTogglePictureInPicture={controls.togglePictureInPicture}
            onToggleSubtitles={() =>
              setSubtitleId((previous) => (previous ? null : (manifest.subtitles[0]?.id ?? null)))
            }
            onOpenSettings={() => setShowSettings((open) => !open)}
            previousHref={manifest.previousEpisode?.href ?? null}
            nextHref={manifest.nextEpisode?.href ?? null}
          />
        </div>
      )}

      {/*
        Beágyazott forrásnál nincs automatikus váltás.

        Egy másik eredetű keret semmi használhatót nem jelent vissza, ha a
        szolgáltató elesett — nincs megbízható hibaesemény, és belelátni sem
        lehet. A lejátszó tehát tényleg nem tudja megkülönböztetni a halott
        tárhelyet a lassútól. Ezt kimondani, a váltás gombja mellett, többet ér,
        mint egy pörgő ikon, ami sosem áll meg.
      */}
      {plan?.mode === 'isolated' && phase === 'ready' && manifest.chain.length > 1 && (
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="absolute right-3 bottom-3 z-10 min-h-11 rounded-lg border border-white/20 bg-black/70 px-3 text-2xs text-mist-200 backdrop-blur-sm hover:bg-black/90"
        >
          Nem indul el? Válts forrást
        </button>
      )}
    </div>
  );
}
