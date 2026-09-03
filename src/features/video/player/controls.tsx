'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatTime, spokenTime } from '@/features/video/player/timeline';

/**
 * A lejátszó vezérlősávja.
 *
 * ## Miért nem a natív vezérlők
 *
 * Mert a natív sáv nem tud arról, amiért ez a rendszer épült: nincs benne
 * forrásváltás, nincs benne „Főcím átugrása”, nincs benne a mi feliratmotorunk,
 * és minden böngészőben másképp néz ki. Egy prémium lejátszónak egyetlen arca
 * van, akárhol nyitják meg.
 *
 * ## Amit a felület biztosan tud
 *
 * Minden gomb valódi `<button>`, saját `aria-label`-lel: a lejátszó
 * billentyűzetről és képernyőolvasóval is végigjárható. A haladássáv `slider`
 * szerepű, és nyilakkal is mozgatható — nem csak egérrel húzható `<div>`.
 *
 * Az érintésre méretezett találati felület nem opcionális: 44 pixel az, amit egy
 * hüvelykujj megbízhatóan eltalál, és a vezérlők fele mobilon fog megnyílni.
 */

export interface ControlsProps {
  isPlaying: boolean;
  currentSec: number;
  durationSec: number;
  bufferedAheadSec: number;
  volume: number;
  isMuted: boolean;
  rate: number;
  isFullscreen: boolean;
  isTheater: boolean;
  isPictureInPicture: boolean;
  canPictureInPicture: boolean;
  hasSubtitles: boolean;
  subtitlesOn: boolean;

  onTogglePlay(): void;
  onSeek(seconds: number): void;
  onVolume(value: number): void;
  onToggleMute(): void;
  onToggleFullscreen(): void;
  onToggleTheater(): void;
  onTogglePictureInPicture(): void;
  onToggleSubtitles(): void;
  onOpenSettings(): void;

  previousHref: string | null;
  nextHref: string | null;
}

function IconButton({
  label,
  onClick,
  children,
  className,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      className={cn(
        // 44px: ennyi az, amit egy hüvelykujj megbízhatóan eltalál.
        'grid size-11 shrink-0 place-items-center rounded-lg text-mist-100',
        'transition-colors duration-fast hover:bg-white/10',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A haladássáv.
 *
 * Külön komponens, mert három dolgot csinál egyszerre — mutatja a pozíciót,
 * mutatja a puffert, és fogadja a húzást —, és mert húzás közben **nem** követi
 * a videó idejét: aki húzza, azt zavarná, ha a fogantyú kiugrana a keze alól.
 */
function Scrubber({
  currentSec,
  durationSec,
  bufferedAheadSec,
  onSeek,
}: {
  currentSec: number;
  durationSec: number;
  bufferedAheadSec: number;
  onSeek: (seconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragSec, setDragSec] = useState<number | null>(null);

  const shown = dragSec ?? currentSec;
  const percent = durationSec > 0 ? Math.min(100, (shown / durationSec) * 100) : 0;
  const buffered =
    durationSec > 0
      ? Math.min(100, ((currentSec + bufferedAheadSec) / durationSec) * 100)
      : 0;

  const positionFrom = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || durationSec <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(Math.max(0, ratio), 1) * durationSec;
  };

  const beginDrag = (clientX: number) => {
    setDragSec(positionFrom(clientX));

    const move = (event: PointerEvent) => setDragSec(positionFrom(event.clientX));
    const end = (event: PointerEvent) => {
      onSeek(positionFrom(event.clientX));
      setDragSec(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Lejátszási pozíció"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(durationSec))}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${spokenTime(shown)} / ${spokenTime(durationSec)}`}
      onPointerDown={(event) => {
        event.preventDefault();
        beginDrag(event.clientX);
      }}
      onKeyDown={(event) => {
        // A billentyűs kezelés itt is kell: a fókuszált sávnak magának kell
        // reagálnia, függetlenül attól, hogy a lejátszó globális gyorsbillentyűi
        // épp aktívak-e.
        const step = event.shiftKey ? 30 : 5;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onSeek(Math.max(0, currentSec - step));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onSeek(Math.min(durationSec, currentSec + step));
        } else if (event.key === 'Home') {
          event.preventDefault();
          onSeek(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          onSeek(durationSec);
        }
      }}
      /*
        A magas, átlátszó találati felület a `py-3`-ban van, a vékony vizuális
        sáv belül. Így a sáv úgy néz ki, mint egy hajszálvonal, de eltalálni
        mégis könnyű — érintéssel is.
      */
      className="group/scrub relative cursor-pointer touch-none py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom-400"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
        <div
          className="absolute inset-y-0 left-0 bg-white/30"
          style={{ width: `${buffered}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 left-0 bg-bloom-400"
          style={{ width: `${percent}%` }}
          aria-hidden
        />
      </div>

      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bloom-400 shadow',
          'transition-transform duration-fast',
          dragSec === null && 'scale-0 group-hover/scrub:scale-100 group-focus-visible/scrub:scale-100',
        )}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

export function PlayerControls(props: ControlsProps) {
  const {
    isPlaying,
    currentSec,
    durationSec,
    volume,
    isMuted,
    isFullscreen,
    isTheater,
    isPictureInPicture,
    canPictureInPicture,
    hasSubtitles,
    subtitlesOn,
  } = props;

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      /*
        A sáv fölötti sötét átmenet nem dísz: a vezérlők világos képen is
        olvashatók maradnak tőle. Enélkül egy havas jelenet fölött a fehér ikonok
        egyszerűen eltűnnek.
      */
      /*
        Kis képernyőn kevesebb felvezető átmenet.

        Egy 390 pixel széles telefonon a lejátszó 219 pixel magas; a sáv a maga
        teljes magasságával ennek majdnem a felét elvenné, és a dupla koppintásos
        tekerésnek alig maradna hely. A böngészős mérés pontosan ezt mutatta: a
        képközépre eső koppintás már a vezérlősávot találta el.
      */
      className="bg-linear-to-t from-black/85 via-black/55 to-transparent px-2 pt-4 pb-0.5 sm:px-3 sm:pt-8 sm:pb-1"
    >
      <Scrubber
        currentSec={currentSec}
        durationSec={durationSec}
        bufferedAheadSec={props.bufferedAheadSec}
        onSeek={props.onSeek}
      />

      <div className="flex items-center gap-0.5 sm:gap-1">
        <IconButton
          label={isPlaying ? 'Szünet' : 'Lejátszás'}
          onClick={props.onTogglePlay}
        >
          {isPlaying ? (
            <Pause className="size-5 fill-current" aria-hidden />
          ) : (
            <Play className="size-5 fill-current" aria-hidden />
          )}
        </IconButton>

        {props.previousHref && (
          <a
            href={props.previousHref}
            aria-label="Előző rész"
            title="Előző rész"
            className="hidden size-11 shrink-0 place-items-center rounded-lg text-mist-100 transition-colors duration-fast hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 sm:grid"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </a>
        )}

        {props.nextHref && (
          <a
            href={props.nextHref}
            aria-label="Következő rész"
            title="Következő rész"
            className="hidden size-11 shrink-0 place-items-center rounded-lg text-mist-100 transition-colors duration-fast hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 sm:grid"
          >
            <ChevronRight className="size-5" aria-hidden />
          </a>
        )}

        {/*
          A hangerőcsúszka egérre nyílik ki, érintésen nem: mobilon a rendszer
          hangerőgombja a természetes vezérlő, és egy 80 pixeles csúszka ott
          csak helyet foglalna a fontosabb gomboktól.
        */}
        <div className="group/vol flex items-center">
          <IconButton
            label={isMuted ? 'Némítás feloldása' : 'Némítás'}
            onClick={props.onToggleMute}
            pressed={isMuted}
          >
            <VolumeIcon className="size-5" aria-hidden />
          </IconButton>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(event) => props.onVolume(Number(event.target.value))}
            aria-label="Hangerő"
            className={cn(
              'h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 opacity-0',
              'transition-[width,opacity] duration-base',
              'group-hover/vol:w-16 group-hover/vol:opacity-100 group-focus-within/vol:w-16 group-focus-within/vol:opacity-100',
              'accent-bloom-400',
              'hidden sm:block',
            )}
          />
        </div>

        <p className="nums ml-1.5 shrink-0 text-2xs tabular-nums text-mist-200 sm:text-xs">
          <span className="sr-only">Eltelt idő: </span>
          {formatTime(currentSec, durationSec)}
          <span className="mx-1 text-mist-500" aria-hidden>
            /
          </span>
          <span className="sr-only">Teljes hossz: </span>
          <span className="text-mist-400">{formatTime(durationSec, durationSec)}</span>
        </p>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {props.rate !== 1 && (
            <span
              className="nums grid h-11 shrink-0 place-items-center px-1.5 text-2xs font-semibold text-bloom-300"
              aria-hidden
            >
              {props.rate}×
            </span>
          )}

          {hasSubtitles && (
            <IconButton
              label={subtitlesOn ? 'Felirat kikapcsolása' : 'Felirat bekapcsolása'}
              onClick={props.onToggleSubtitles}
              pressed={subtitlesOn}
              className={subtitlesOn ? 'text-bloom-300' : undefined}
            >
              <Captions className="size-5" aria-hidden />
            </IconButton>
          )}

          <IconButton label="Beállítások" onClick={props.onOpenSettings}>
            <Settings className="size-5" aria-hidden />
          </IconButton>

          {canPictureInPicture && (
            <IconButton
              label="Kép a képben"
              onClick={props.onTogglePictureInPicture}
              pressed={isPictureInPicture}
              className="hidden sm:grid"
            >
              <PictureInPicture2 className="size-5" aria-hidden />
            </IconButton>
          )}

          {/* Mozi mód csak ott, ahol van mit kitágítani. */}
          <IconButton
            label={isTheater ? 'Mozi mód kikapcsolása' : 'Mozi mód'}
            onClick={props.onToggleTheater}
            pressed={isTheater}
            className="hidden lg:grid"
          >
            <RectangleHorizontal className="size-5" aria-hidden />
          </IconButton>

          <IconButton
            label={isFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
            onClick={props.onToggleFullscreen}
            pressed={isFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="size-5" aria-hidden />
            ) : (
              <Maximize className="size-5" aria-hidden />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
