'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PLAYBACK_RATES, clampTime, type PlaybackRate } from '@/features/video/player/timeline';

/**
 * A `<video>` elem állapota, Reactből nézve.
 *
 * ## Miért kell egyáltalán
 *
 * A médiaelem a saját állapotát önmagában tartja, és eseményekkel szól, ha
 * változik. A felület viszont Reactből rajzolódik. A kettő között valakinek
 * fordítania kell, és ha ez a fordítás a komponensben szétszórva történik, két
 * baj lesz belőle: a vezérlők néha nem frissülnek (mert valamelyik eseményre
 * nem iratkoztunk fel), és a leiratkozás elmarad (mert nehéz átlátni).
 *
 * ## Az elem az igazság, nem a state
 *
 * A `play()` nem azonnal játszik, a `currentTime` írása nem azonnal ugrik, és a
 * felhasználó a rendszerszintű vezérlőkkel (fejhallgató gomb, Kép a képben
 * ablak) is beleszólhat. Ezért a hook **soha nem tippel**: minden érték az elem
 * eseményéből frissül. Egy „optimista” szüneteltetés, ami valójában nem
 * történt meg, pontosan az a hiba, amit nézés közben lehetetlen megérteni.
 */

export interface MediaState {
  isPlaying: boolean;
  /** Az elem betölt vagy pufferel — a felület pörgőt mutat. */
  isBuffering: boolean;
  currentSec: number;
  durationSec: number;
  /** A jelenlegi pozíciótól előre betöltött másodpercek. */
  bufferedRanges: { start: number; end: number }[];
  volume: number;
  isMuted: boolean;
  rate: number;
  isPictureInPicture: boolean;
  /** Elértük-e a végét. */
  hasEnded: boolean;
}

const INITIAL: MediaState = {
  isPlaying: false,
  isBuffering: false,
  currentSec: 0,
  durationSec: 0,
  bufferedRanges: [],
  volume: 1,
  isMuted: false,
  rate: 1,
  isPictureInPicture: false,
  hasEnded: false,
};

export interface MediaControls {
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekTo(seconds: number): void;
  seekBy(delta: number): void;
  setVolume(value: number): void;
  adjustVolume(delta: number): void;
  toggleMute(): void;
  setRate(rate: PlaybackRate): void;
  togglePictureInPicture(): void;
}

export function useMediaState(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  /** Újraköti a figyelést, ha a forrás cserélődik. */
  sourceKey: string | null,
): { state: MediaState; controls: MediaControls } {
  const [state, setState] = useState<MediaState>(INITIAL);

  /*
    A hangerő és a sebesség túléli a forrásváltást.

    Aki lehalkította, mert éjszaka néz, nem akarja minden forrásváltásnál újra
    lehalkítani — pedig a `<video>` elem új forrásnál a saját alapértékeivel
    indul, ha nem állítjuk vissza.
  */
  const preferencesRef = useRef({ volume: 1, muted: false, rate: 1 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const readBuffered = () => {
      const ranges: { start: number; end: number }[] = [];
      for (let index = 0; index < video.buffered.length; index += 1) {
        ranges.push({ start: video.buffered.start(index), end: video.buffered.end(index) });
      }
      return ranges;
    };

    const sync = () => {
      setState({
        isPlaying: !video.paused && !video.ended,
        // `readyState < 3` = nincs elég adat a folyamatos lejátszáshoz.
        isBuffering: !video.paused && video.readyState < 3,
        currentSec: video.currentTime,
        durationSec: Number.isFinite(video.duration) ? video.duration : 0,
        bufferedRanges: readBuffered(),
        volume: video.volume,
        isMuted: video.muted,
        rate: video.playbackRate,
        isPictureInPicture: document.pictureInPictureElement === video,
        hasEnded: video.ended,
      });
    };

    /*
      Minden esemény ugyanazt a teljes szinkronizálást hívja.

      Eseményenként külön részleges frissítést írni gyorsabbnak tűnik, de a
      gyakorlatban ott csúszik el: valamelyik ág kimarad, és a felület egy
      állapotban ragad, amit csak véletlenszerűen lehet reprodukálni.
    */
    const events = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'durationchange',
      'progress',
      'volumechange',
      'ratechange',
      'waiting',
      'playing',
      'canplay',
      'seeking',
      'seeked',
      'loadedmetadata',
      'enterpictureinpicture',
      'leavepictureinpicture',
    ] as const;

    for (const event of events) video.addEventListener(event, sync);

    // A beállítások visszaállítása az új forrásra.
    video.volume = preferencesRef.current.volume;
    video.muted = preferencesRef.current.muted;
    video.playbackRate = preferencesRef.current.rate;

    sync();

    return () => {
      for (const event of events) video.removeEventListener(event, sync);
    };
  }, [videoRef, sourceKey]);

  const controls: MediaControls = {
    play: useCallback(() => {
      // A `play()` ígéretet ad, és elutasíthat (automatikus lejátszás tiltva).
      // Az elutasítás nem hiba: a `pause` esemény úgyis szinkronizál.
      void videoRef.current?.play().catch(() => undefined);
    }, [videoRef]),

    pause: useCallback(() => {
      videoRef.current?.pause();
    }, [videoRef]),

    togglePlay: useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) void video.play().catch(() => undefined);
      else video.pause();
    }, [videoRef]),

    seekTo: useCallback(
      (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = clampTime(seconds, video.duration);
      },
      [videoRef],
    ),

    seekBy: useCallback(
      (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = clampTime(video.currentTime + delta, video.duration);
      },
      [videoRef],
    ),

    setVolume: useCallback(
      (value: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = Math.min(Math.max(0, value), 1);
        video.volume = next;
        // Hangerőt állítani némítva értelmetlen — a néző hangot akar.
        if (next > 0) video.muted = false;
        preferencesRef.current.volume = next;
        preferencesRef.current.muted = video.muted;
      },
      [videoRef],
    ),

    adjustVolume: useCallback(
      (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = Math.min(Math.max(0, video.volume + delta), 1);
        video.volume = next;
        if (next > 0) video.muted = false;
        preferencesRef.current.volume = next;
        preferencesRef.current.muted = video.muted;
      },
      [videoRef],
    ),

    toggleMute: useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      preferencesRef.current.muted = video.muted;
    }, [videoRef]),

    setRate: useCallback(
      (rate: PlaybackRate) => {
        const video = videoRef.current;
        if (!video || !PLAYBACK_RATES.includes(rate)) return;
        video.playbackRate = rate;
        preferencesRef.current.rate = rate;
      },
      [videoRef],
    ),

    togglePictureInPicture: useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      /*
        A Kép a képben nincs mindenhol, és a hívása elutasíthat.

        iOS Safariban egészen más API van rá, Firefoxban pedig csak a felhasználó
        indíthatja a saját gombjáról — a mi gombunk ott csendben nem csinál
        semmit. Elrejteni nem érdemes: a képességet a felület kérdezi le, és ahol
        nincs, ott a gomb sem jelenik meg.
      */
      if (document.pictureInPictureElement === video) {
        void document.exitPictureInPicture().catch(() => undefined);
        return;
      }
      void video.requestPictureInPicture?.().catch(() => undefined);
    }, [videoRef]),
  };

  return { state, controls };
}

/** Támogatja-e ez a böngésző a Kép a képben módot. */
export function supportsPictureInPicture(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    'pictureInPictureEnabled' in document &&
    (document as Document & { pictureInPictureEnabled: boolean }).pictureInPictureEnabled
  );
}
