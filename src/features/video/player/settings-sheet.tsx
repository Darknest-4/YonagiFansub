'use client';

import { useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { PLAYBACK_RATES, type PlaybackRate } from '@/features/video/player/timeline';
import { SHORTCUT_HELP } from '@/features/video/player/keyboard';
import type { QualityStep } from '@/features/video/resolver';

/**
 * A beállítások panel.
 *
 * ## Miért lap, és nem legördülő
 *
 * Mert mobilon nyílik meg a leggyakrabban, és egy videó fölött lebegő,
 * hüvelykujjal navigálandó legördülő menü ott menthetetlen. Ez a panel alulról
 * jön be, teljes szélességben, és minden sora 44 pixel magas.
 *
 * ## Egy szint, nem fa
 *
 * A menü egyetlen lépésben mélyül: főlista → egy alcsoport. Három szint mélyre
 * ásni videó közben azt jelenti, hogy a néző elveszíti a fonalat, mire
 * megtalálja a feliratot — és közben megy a rész.
 */

export interface SubtitleOption {
  id: string;
  label: string;
  language: string;
}

export interface SettingsSheetProps {
  onClose(): void;

  qualities: QualityStep[];
  quality: QualityStep | 'AUTO';
  resolvedQuality: QualityStep | null;
  onQuality(value: QualityStep | 'AUTO'): void;

  rate: number;
  onRate(value: PlaybackRate): void;

  subtitles: SubtitleOption[];
  activeSubtitleId: string | null;
  onSubtitle(id: string | null): void;

  autoplayNext: boolean;
  onAutoplayNext(value: boolean): void;

  skipIntro: boolean;
  onSkipIntro(value: boolean): void;

  sources: { id: string; label: string; providerName: string | null }[];
  activeSourceId: string | null;
  onSource(id: string): void;
}

type Panel = 'root' | 'quality' | 'subtitles' | 'rate' | 'source' | 'shortcuts';

function Row({
  label,
  value,
  onClick,
  selected,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm',
        'transition-colors duration-fast hover:bg-white/10',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400',
        selected ? 'text-bloom-300' : 'text-mist-100',
      )}
      {...(selected === undefined ? {} : { 'aria-current': selected ? 'true' : undefined })}
    >
      {selected !== undefined && (
        <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
      )}
      <span className="flex-1">{label}</span>
      {value && <span className="text-2xs text-mist-400">{value}</span>}
      {value === undefined && selected === undefined && (
        <ChevronRight className="size-4 shrink-0 text-mist-500" aria-hidden />
      )}
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-mist-100 transition-colors duration-fast hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400"
    >
      <span className="flex-1">
        {label}
        {hint && <span className="block text-2xs text-mist-500">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-fast',
          checked ? 'bg-bloom-500' : 'bg-white/25',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white transition-transform duration-fast',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

export function SettingsSheet(props: SettingsSheetProps) {
  const [panel, setPanel] = useState<Panel>('root');

  const qualityLabel =
    props.quality === 'AUTO'
      ? props.resolvedQuality
        ? `Automatikus (${props.resolvedQuality})`
        : 'Automatikus'
      : props.quality;

  const activeSubtitle = props.subtitles.find((track) => track.id === props.activeSubtitleId);
  const activeSource = props.sources.find((source) => source.id === props.activeSourceId);

  const back = () => setPanel('root');

  return (
    <div
      role="dialog"
      aria-label="Lejátszó beállításai"
      className="absolute inset-x-0 bottom-0 z-20 max-h-[min(70%,26rem)] overflow-y-auto overscroll-contain rounded-t-xl border-t border-white/10 bg-ink-950/95 p-2 backdrop-blur-md sm:inset-x-auto sm:right-2 sm:bottom-16 sm:w-72 sm:rounded-xl sm:border"
    >
      <div className="mb-1 flex items-center gap-2 px-1">
        {panel !== 'root' && (
          <button
            type="button"
            onClick={back}
            className="grid size-8 place-items-center rounded-lg text-mist-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-bloom-400"
            aria-label="Vissza"
          >
            <ChevronRight className="size-4 rotate-180" aria-hidden />
          </button>
        )}
        <h2 className="flex-1 px-1 text-2xs font-bold tracking-[0.16em] text-mist-400 uppercase">
          {panel === 'root'
            ? 'Beállítások'
            : panel === 'quality'
              ? 'Minőség'
              : panel === 'subtitles'
                ? 'Felirat'
                : panel === 'rate'
                  ? 'Sebesség'
                  : panel === 'source'
                    ? 'Forrás'
                    : 'Gyorsbillentyűk'}
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          className="grid size-8 place-items-center rounded-lg text-mist-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-bloom-400"
          aria-label="Bezárás"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {panel === 'root' && (
        <div className="space-y-0.5">
          {props.qualities.length > 0 && (
            <Row label="Minőség" value={qualityLabel} onClick={() => setPanel('quality')} />
          )}
          {props.subtitles.length > 0 && (
            <Row
              label="Felirat"
              value={activeSubtitle?.label ?? 'Kikapcsolva'}
              onClick={() => setPanel('subtitles')}
            />
          )}
          <Row label="Sebesség" value={`${props.rate}×`} onClick={() => setPanel('rate')} />
          {props.sources.length > 1 && (
            <Row
              label="Forrás"
              value={activeSource?.label ?? '—'}
              onClick={() => setPanel('source')}
            />
          )}

          <div className="my-1 h-px bg-white/10" />

          <Toggle
            label="Következő rész automatikusan"
            checked={props.autoplayNext}
            onChange={props.onAutoplayNext}
          />
          <Toggle
            label="Főcím átugrása"
            hint="Gombot ajánl fel a főcím alatt"
            checked={props.skipIntro}
            onChange={props.onSkipIntro}
          />

          <div className="my-1 h-px bg-white/10" />
          <Row label="Gyorsbillentyűk" onClick={() => setPanel('shortcuts')} />
        </div>
      )}

      {panel === 'quality' && (
        <div className="space-y-0.5">
          <Row
            label="Automatikus"
            onClick={() => {
              props.onQuality('AUTO');
              back();
            }}
            selected={props.quality === 'AUTO'}
          />
          {props.qualities.map((step) => (
            <Row
              key={step}
              label={step}
              onClick={() => {
                props.onQuality(step);
                back();
              }}
              selected={props.quality === step}
            />
          ))}
        </div>
      )}

      {panel === 'subtitles' && (
        <div className="space-y-0.5">
          <Row
            label="Kikapcsolva"
            onClick={() => {
              props.onSubtitle(null);
              back();
            }}
            selected={props.activeSubtitleId === null}
          />
          {props.subtitles.map((track) => (
            <Row
              key={track.id}
              label={track.label}
              onClick={() => {
                props.onSubtitle(track.id);
                back();
              }}
              selected={props.activeSubtitleId === track.id}
            />
          ))}
        </div>
      )}

      {panel === 'rate' && (
        <div className="space-y-0.5">
          {PLAYBACK_RATES.map((rate) => (
            <Row
              key={rate}
              label={rate === 1 ? 'Normál' : `${rate}×`}
              onClick={() => {
                props.onRate(rate);
                back();
              }}
              selected={props.rate === rate}
            />
          ))}
        </div>
      )}

      {panel === 'source' && (
        <div className="space-y-0.5">
          {props.sources.map((source) => (
            <Row
              key={source.id}
              label={source.label}
              value={source.providerName ?? 'Saját'}
              onClick={() => {
                props.onSource(source.id);
                back();
              }}
              selected={props.activeSourceId === source.id}
            />
          ))}
        </div>
      )}

      {panel === 'shortcuts' && (
        <dl className="space-y-1 px-3 py-1 text-sm">
          {SHORTCUT_HELP.map((row) => (
            <div key={row.keys} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-2xs text-mist-200">
                {row.keys}
              </dt>
              <dd className="text-right text-2xs text-mist-400">{row.label}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
