'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Playback, across every kind of source.
 *
 * ## What the protection is, honestly
 *
 * For a source we serve ourselves, the video element is fed through Media
 * Source Extensions, so its `src` is a `blob:` URL local to this tab. There is
 * no media URL in the DOM, nothing for a link-grabber to read, and every
 * underlying request is signed, viewer-bound and expires in about a minute.
 *
 * For a third-party source, there is nothing to hide: the file is on their
 * server and the URL is theirs to publish. What we do instead is confine it —
 * the provider's player runs inside `/beagyazas/[id]`, a same-origin document
 * with a policy naming that one host, sandboxed against popups and against
 * navigating the page out from under the viewer.
 *
 * **Neither makes a video undownloadable.** Anything a browser decodes is on
 * the machine, and only DRM changes that. The goal is to close the cheap paths.
 *
 * ## Source switching
 *
 * Sources are ordered by the team, and the player walks that order on failure:
 * a dead filehost becomes a switch rather than a broken page. The viewer can
 * also pick, and the choice is remembered per episode — somebody who knows one
 * host works badly for them should not have to re-pick every week.
 */

export interface PlayableSource {
  id: string;
  kind: 'HLS_PROXY' | 'DIRECT_FILE' | 'EMBED';
  label: string | null;
  resolution: string;
  requiresAuth: boolean;
  provider: { name: string; slug: string; color: string | null } | null;
}

interface PlaybackPlan {
  mode: 'hls-proxy' | 'file-proxy' | 'isolated';
  url: string;
  expiresIn: number;
  title: string;
  durationSec: number | null;
  allowPopups: boolean;
}

const RESOLUTION_LABEL: Record<string, string> = {
  SD_480P: '480p',
  HD_720P: '720p',
  FHD_1080P: '1080p',
  QHD_1440P: '1440p',
  UHD_2160P: '2160p',
};

function sourceName(source: PlayableSource): string {
  return (
    source.label ??
    source.provider?.name ??
    RESOLUTION_LABEL[source.resolution] ??
    'Forrás'
  );
}

/** Remembers the viewer's pick, per episode. Never fatal if storage is blocked. */
function readPreference(episodeId: string): string | null {
  try {
    return window.localStorage.getItem(`yonagi:source:${episodeId}`);
  } catch {
    return null;
  }
}

function writePreference(episodeId: string, sourceId: string): void {
  try {
    window.localStorage.setItem(`yonagi:source:${episodeId}`, sourceId);
  } catch {
    // A private window or blocked site data: the player still works.
  }
}

/** A CSRF sütijét a middleware állítja be; a `lib/client/api` ugyanezt olvassa. */
function readCsrf(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?yonagi_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export function VideoPlayer({
  episodeId,
  sources,
  poster,
  resumeAt = 0,
  trackProgress = false,
  className,
}: {
  episodeId: string;
  sources: PlayableSource[];
  poster?: string | null;
  /** Hol hagyta abba a néző. Nulla, ha nincs mit folytatni. */
  resumeAt?: number;
  /** Csak bejelentkezett nézőnél: van hova menteni. */
  trackProgress?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const destroyRef = useRef<(() => void) | null>(null);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sources that already failed this session, so failover does not loop. */
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Restore the remembered pick once, on mount.
  useEffect(() => {
    const preferred = readPreference(episodeId);
    if (!preferred) return;
    const found = sources.findIndex((source) => source.id === preferred);
    if (found > 0) setIndex(found);
  }, [episodeId, sources]);

  const current = sources[index];

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

    Beágyazott (harmadik feles) forrásnál nincs mit menteni: a lejátszás egy
    idegen keretben zajlik, aminek a pozícióját nem látjuk. Ilyenkor a néző
    inkább semmilyen jelölést ne kapjon, mint hamisat.
  */
  useEffect(() => {
    if (!trackProgress) return;

    const video = videoRef.current;
    if (!video || plan?.mode === 'isolated') return;

    let lastSent = 0;

    const payload = () => ({
      positionSec: Math.round(video.currentTime),
      durationSec: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
    });

    const send = () => {
      if (!Number.isFinite(video.currentTime) || video.currentTime < 5) return;
      lastSent = video.currentTime;

      void fetch(`/api/v1/watch-progress/${episodeId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(readCsrf() ? { 'X-CSRF-Token': readCsrf()! } : {}),
        },
        body: JSON.stringify(payload()),
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
  }, [episodeId, trackProgress, plan?.mode]);

  /** Moves to the next source that has not already failed. */
  const failover = useCallback(
    (reason: string) => {
      if (!current) return;

      const exhausted = new Set(failed).add(current.id);
      setFailed(exhausted);

      const next = sources.findIndex((source) => !exhausted.has(source.id));
      if (next === -1) {
        setPhase('error');
        setError(
          sources.length > 1
            ? 'Egyik forrás sem elérhető. Próbáld meg később.'
            : reason,
        );
        return;
      }

      teardown();
      setIndex(next);
      setPhase('idle');
      setError(null);
    },
    [current, failed, sources, teardown],
  );

  const start = useCallback(
    async (source: PlayableSource) => {
      setPhase('loading');
      setError(null);

      let loaded: PlaybackPlan;
      try {
        const response = await fetch(`/api/v1/watch/${source.id}/manifest`, {
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

      // A third-party source plays inside its own frame; nothing to attach.
      if (loaded.mode === 'isolated') {
        setPhase('ready');
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      /*
        Folytatás onnan, ahol abbahagyta.

        A `loadedmetadata` bevárása nem díszítés: a `currentTime` beállítása
        addig, amíg a lejátszó nem tudja a hosszt, csendben elveszik. Egyszer
        fut le — utána a néző dolga, hol tekereg.
      */
      const resume = () => {
        if (resumeAt > 5 && Number.isFinite(video.duration) && resumeAt < video.duration - 10) {
          video.currentTime = resumeAt;
        }
      };
      video.addEventListener('loadedmetadata', resume, { once: true });

      // A proxied file is an ordinary media URL on our own origin.
      if (loaded.mode === 'file-proxy') {
        video.src = loaded.url;
        setPhase('ready');
        return;
      }

      // Safari plays HLS natively and cannot use MSE for it. The playlist is
      // still signed and still expires; only the blob indirection is missing,
      // which is a platform limit rather than a choice.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = loaded.url;
        setPhase('ready');
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
          Recovery, with a limit.

          The first version retried every fatal network error by calling
          `startLoad()` — right for the common case (a token that aged out while
          the viewer was paused) and wrong for everything else. hls.js reports a
          playlist it cannot parse as a *network* error too, and `startLoad()` on
          a session with no parsed manifest does nothing at all: no request, no
          event, no message. The player sat on "Betöltés…" forever, and the log
          was empty because nothing had failed loudly.

          So each recovery gets a budget. Past it the source is declared dead and
          failover moves on, which is the honest outcome and the one that lets
          the viewer reach a working source instead of watching a spinner.
        */
        let networkRetries = 0;
        let mediaRetries = 0;

        /*
          Last line of defence: a source that neither starts nor fails.

          Every hang we have actually seen had its own cause, and each got its
          own handling above — but the failure mode they shared is the one the
          viewer suffers: a spinner that never resolves and no way forward. A
          watchdog turns any future variant of that into a normal failover,
          without having to predict what the cause will be.
        */
        let settled = false;
        const watchdog = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          hls.destroy();
          failover('A forrás nem válaszol.');
        }, 30_000);

        const finish = (): void => {
          settled = true;
          window.clearTimeout(watchdog);
        };

        hls.on(Hls.Events.ERROR, (_event, payload) => {
          if (!payload.fatal || settled) return;

          /*
            A codec the browser cannot decode is not a transient failure, and
            `recoverMediaError()` cannot conjure a decoder — retrying only turns
            a clear problem into a spinner. Chromium builds without the
            proprietary codecs (and some Linux distribution builds) reject
            H.264/AAC exactly this way, which is worth naming in the message:
            "it does not work" sends the viewer to us, "your browser cannot play
            H.264" sends them to a browser that can.
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

          if (payload.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 3) {
            networkRetries += 1;
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
          // `details` names the actual failure ("manifestParsingError",
          // "levelLoadError"); without it every playback problem looks the same
          // in a bug report.
          failover(`A lejátszás megszakadt (${payload.details}).`);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          finish();
          setPhase('ready');
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
    [failover, resumeAt],
  );

  const pick = (next: number) => {
    const source = sources[next];
    if (!source || next === index) return;

    teardown();
    setIndex(next);
    setPhase('idle');
    setError(null);
    writePreference(episodeId, source.id);
  };

  if (sources.length === 0 || !current) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-ink-800 bg-ink-950">
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
          <video
            ref={videoRef}
            controls={phase === 'ready'}
            poster={poster ?? undefined}
            playsInline
            // Hides the download entry in the native menu. A courtesy, not a
            // control — it removes the obvious button and nothing more.
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(event) => event.preventDefault()}
            onError={() => phase === 'ready' && failover('A lejátszás megszakadt.')}
            className="size-full bg-black"
          />
        )}

        {phase !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/70 p-6 text-center backdrop-blur-sm">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={() => void start(current)}
                className="group flex flex-col items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom-400"
              >
                <span className="grid size-16 place-items-center rounded-full bg-bloom-500 text-white shadow-glow-bloom transition-transform duration-base group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <Play className="ml-1 size-7 fill-current" aria-hidden />
                </span>
                <span className="text-sm font-medium text-mist-100">
                  Lejátszás — {sourceName(current)}
                </span>
              </button>
            )}

            {phase === 'loading' && (
              <p className="flex items-center gap-2 text-sm text-mist-300">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Betöltés…
              </p>
            )}

            {phase === 'error' && (
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
                  className="mt-3 text-2xs text-bloom-300 underline-offset-4 hover:underline"
                >
                  Újrapróbálás
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        Automatic failover cannot cover an embed. A cross-origin iframe reports
        nothing usable when the provider is down — no error event we can trust,
        no way to read inside it — so the player genuinely cannot tell a dead
        filehost from one that is merely slow. Saying so, next to the switch that
        fixes it, beats a spinner that never resolves and no explanation.
      */}
      {plan?.mode === 'isolated' && phase === 'ready' && sources.length > 1 && (
        <p className="text-2xs text-mist-600">
          Ha ez a forrás nem indul el, válts alább egy másikra.
        </p>
      )}

      {sources.length > 1 && (
        <nav aria-label="Forrás választása" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-2xs text-mist-600">Forrás:</span>
          {sources.map((source, position) => {
            const isCurrent = position === index;
            const isDead = failed.has(source.id);

            return (
              <button
                key={source.id}
                type="button"
                onClick={() => pick(position)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors duration-fast',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
                  isCurrent
                    ? 'border-bloom-500/50 bg-bloom-500/15 text-bloom-300'
                    : isDead
                      ? 'border-ink-800 text-mist-700 line-through'
                      : 'border-ink-700 text-mist-400 hover:border-ink-600 hover:text-mist-100',
                )}
              >
                {sourceName(source)}
                {source.provider && source.label && (
                  <span className="ml-1 text-mist-600">· {source.provider.name}</span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
