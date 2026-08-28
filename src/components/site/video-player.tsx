'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Protected HLS player.
 *
 * ## What the protection is, honestly
 *
 * The video element is fed through Media Source Extensions, so its `src` is a
 * `blob:` URL that exists only inside this tab. There is no media URL in the
 * DOM, no "copy video address" in the context menu, and nothing for a
 * link-grabber extension to find by reading the page.
 *
 * Everything below that is signed and short-lived: the playlist is generated per
 * request, each segment carries its own token bound to this viewer, and the
 * tokens expire in about a minute. A URL copied from the network tab is dead
 * before it can be used anywhere else.
 *
 * **This does not make the video undownloadable.** The decoded stream is in the
 * browser; anything in the browser can be captured. A person with developer
 * tools, or an extension that hooks MSE rather than scraping the DOM, will get
 * the file. Preventing that requires DRM (Widevine/PlayReady/FairPlay), which
 * means a licence server and per-title packaging — a different project with
 * different costs. What this does is remove every easy path, which is the
 * realistic goal.
 *
 * ## Why hls.js and not a plain `<video src>`
 *
 * Safari plays HLS natively, and native playback is used there — it is smoother
 * and hardware-accelerated. Everywhere else hls.js is required for HLS at all,
 * and it happens to give us the blob indirection for free. It is imported
 * dynamically so its ~200KB never lands in a bundle for a page with no video on
 * it.
 */

interface ManifestResponse {
  data: { url: string; expiresIn: number; title: string; durationSec: number | null };
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export function VideoPlayer({
  videoId,
  poster,
  className,
}: {
  videoId: string;
  poster?: string | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref so cleanup can reach it without re-running the effect.
  const destroyRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setPhase('loading');
    setError(null);

    try {
      const response = await fetch(`/api/v1/watch/${videoId}/manifest`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'A lejátszás nem indítható.');
      }

      const { data } = (await response.json()) as ManifestResponse;

      // Safari (and iOS in general) plays HLS natively and cannot use MSE for
      // it. The playlist URL still expires and is still viewer-bound; only the
      // blob indirection is missing, which is a platform limit, not a choice.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = data.url;
        setPhase('ready');
        return;
      }

      const { default: Hls } = await import('hls.js');

      if (!Hls.isSupported()) {
        throw new Error('Ez a böngésző nem támogatja a lejátszást.');
      }

      const hls = new Hls({
        // Credentials have to ride along: every playback URL is authorised by
        // the session or the anonymous cookie.
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
        enableWorker: true,
        lowLatencyMode: false,
        // A long buffer would mean holding a large decoded chunk of the episode
        // in memory; 60 seconds is enough to ride out a bad connection.
        maxBufferLength: 60,
      });

      hls.on(Hls.Events.ERROR, (_event, payload) => {
        if (!payload.fatal) return;

        // A 403 here almost always means the token aged out while paused.
        // Restarting the session is the correct recovery and is invisible.
        if (payload.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (payload.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }

        setPhase('error');
        setError('A lejátszás megszakadt. Töltsd újra az oldalt.');
        hls.destroy();
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => setPhase('ready'));

      hls.loadSource(data.url);
      hls.attachMedia(video);

      destroyRef.current = () => hls.destroy();
    } catch (caught) {
      setPhase('error');
      setError(caught instanceof Error ? caught.message : 'A lejátszás nem indítható.');
    }
  }, [videoId]);

  useEffect(() => {
    return () => {
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, []);

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-xl border border-ink-800 bg-ink-950',
        className,
      )}
    >
      <video
        ref={videoRef}
        controls={phase === 'ready'}
        poster={poster ?? undefined}
        playsInline
        // `nodownload` removes the download button from the native controls.
        // It is a courtesy, not a control: the menu is the only thing it hides.
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        className="size-full bg-black"
      />

      {phase !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/70 p-6 text-center backdrop-blur-sm">
          {phase === 'idle' && (
            <button
              type="button"
              onClick={start}
              className="group flex flex-col items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom-400"
            >
              <span className="grid size-16 place-items-center rounded-full bg-bloom-500 text-white shadow-glow-bloom transition-transform duration-base group-hover:scale-105 motion-reduce:group-hover:scale-100">
                <svg viewBox="0 0 24 24" className="ml-1 size-7 fill-current" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="text-sm font-medium text-mist-100">Lejátszás</span>
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
                onClick={start}
                className="mt-3 text-2xs text-bloom-300 underline-offset-4 hover:underline"
              >
                Újrapróbálás
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
