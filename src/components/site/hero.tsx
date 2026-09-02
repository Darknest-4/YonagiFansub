'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn, truncate } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { LogoMark } from '@/components/site/logo';

export interface HeroProject {
  slug: string;
  title: string;
  titleNative: string | null;
  synopsis: string | null;
  type: string;
  status: 'ANNOUNCED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'DROPPED';
  seasonYear: number | null;
  bannerImageUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string | null;
  genres: Array<{ genre: { slug: string; name: string } }>;
  _count: { episodes: number };
}

const SLIDE_MS = 7000;

/**
 * Home hero.
 *
 * Two halves: the brand on the left, the artwork bleeding off the right edge.
 * The split is what lets the wordmark be genuinely large — a centred hero over a
 * full-width image has to keep the type small enough not to fight the picture,
 * and ends up doing neither well.
 *
 * The slide indicator advances, but **only on interaction or on a timer that
 * pauses on hover and focus, and never at all under `prefers-reduced-motion`**.
 * An auto-advancing carousel that moves content out from under a pointer is a
 * usability failure; one that a person can drive, and that stops when they show
 * interest, is not. The counter is visible for the same reason: a carousel that
 * hides how much it contains just makes people wait to find out.
 */
export function Hero({
  projects,
  stats: _stats,
}: {
  projects: HeroProject[];
  stats: { projects: number; episodes: number; views: number };
}) {
  const slides = projects.slice(0, 3);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  const active = slides[index] ?? null;
  const accent = active?.accentColor ?? '#f761a8';
  const artwork = active?.bannerImageUrl ?? active?.coverImageUrl ?? null;

  return (
    <section
      className="relative isolate overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* ── Artwork, bleeding off the right edge ─────────────────────────────
          On mobile it becomes a full-width backdrop instead: a half-width image
          at 390px is too small to read as art and too big to ignore. */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 lg:left-[38%]">
          {artwork ? (
            <Image
              key={artwork}
              src={artwork}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 62vw, 100vw"
              className="animate-fade-in object-cover object-center"
            />
          ) : (
            /*
              Tartaléknézet borítókép nélkül.
              
              Egy friss telepítésen nincs egyetlen kép sem, és a hero jobb fele
              üresen maradna — pont a legelső képernyő lenne a leggyengébb.
              Ez nem „hiányzó kép" helyőrző, hanem egy megtervezett állapot:
              ugyanaz a színátmenet és ugyanaz a jel, amit a márka amúgy is
              használ. Amint az első borító feltöltésre kerül, átveszi a helyét.
            */
            <div aria-hidden className="absolute inset-0 grid place-items-center overflow-hidden">
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(70% 60% at 60% 40%, color-mix(in oklab, ${accent} 30%, transparent), transparent 72%),
                               radial-gradient(60% 70% at 85% 75%, color-mix(in oklab, var(--color-orchid-500) 26%, transparent), transparent 70%)`,
                }}
              />
              <LogoMark
                id="hero"
                className="relative size-64 opacity-[0.07] blur-[1px] lg:size-96"
              />
            </div>
          )}

          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(90% 70% at 70% 30%, color-mix(in oklab, ${accent} 20%, transparent), transparent 70%)`,
            }}
          />
        </div>

        {/* Scrims. The horizontal one carries the text side; the vertical ones
            seal the hero into the header above and the section below. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-b from-ink-950/85 via-ink-950/20 to-ink-950 lg:bg-linear-to-r lg:from-ink-950 lg:via-ink-950/85 lg:to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-ink-950 to-transparent"
        />
        <div aria-hidden className="noise absolute inset-0 opacity-60" />
      </div>

      <div className="container-wide relative">
        <div className="flex min-h-[32rem] flex-col justify-center py-20 sm:min-h-[36rem] lg:min-h-[40rem] lg:max-w-[46%] lg:py-24">
          <p className="mb-6 text-2xs font-semibold tracking-[0.5em] text-mist-400 uppercase">
            Üdvözlünk a
          </p>

          {/*
            The wordmark, at the one size where the tracking reads as design
            rather than as a spacing bug. `clamp` rather than breakpoints:
            between 390 and 1440 there is no width where a step would be right.

            An `h1`, not a `p`: this is the home page's heading, and it was the
            only page on the site without one. Nothing about it looks different —
            the element carries its own type scale — but a screen reader now has
            a document outline to start from, and so does a crawler.
          */}
          <h1 className="font-display leading-[0.95] font-bold text-mist-50 uppercase">
            <span
              className="block"
              style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', letterSpacing: '0.1em' }}
            >
              Yonagi
            </span>
            <span
              className="mt-2 block text-bloom-400"
              style={{ fontSize: 'clamp(1.1rem, 2.6vw, 2rem)', letterSpacing: '0.42em' }}
            >
              Fansub
            </span>
          </h1>

          <p className="mt-7 max-w-md text-base leading-relaxed text-mist-300">
            {active?.synopsis
              ? truncate(active.synopsis, 180)
              : 'Egy lelkes csapat, akik azért dolgoznak, hogy a legjobb animék magyar felirattal kerüljenek hozzád.'}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink
              href="/projektek"
              variant="primary"
              size="lg"
              className="text-2xs tracking-[0.14em] uppercase"
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              Megnézem a projekteket
            </ButtonLink>

            <ButtonLink
              href={active ? `/projektek/${active.slug}` : '/projektek'}
              variant="outline"
              size="lg"
              className="text-2xs tracking-[0.14em] uppercase"
            >
              {active ? 'Projekt megnyitása' : 'Projektek böngészése'}
            </ButtonLink>
          </div>

          {slides.length > 1 && (
            <SlideIndicator count={slides.length} index={index} onSelect={go} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Slide indicator.
 *
 * A numeric counter plus a progress rail, not a row of dots. Dots tell you
 * neither where you are nor how far it goes once there are more than three, and
 * they are a small touch target; the segments here are full buttons with the
 * slide's own name behind them.
 */
function SlideIndicator({
  count,
  index,
  onSelect,
}: {
  count: number;
  index: number;
  onSelect: (next: number) => void;
}) {
  const pad = (value: number) => String(value + 1).padStart(2, '0');

  return (
    <div className="mt-12 flex items-center gap-4">
      <span className="nums text-sm font-semibold text-mist-50">{pad(index)}</span>

      <div className="flex items-center gap-1.5" role="tablist" aria-label="Kiemelt projektek">
        {/*
          The rail is 2px of ink, but the button around it is 44px tall. A
          hairline is the right visual weight here and the wrong hit area — on a
          touch screen nobody lands on two pixels — so the padding carries the
          target and the inner span carries the design.
        */}
        {Array.from({ length: count }, (_, slide) => (
          <button
            key={slide}
            type="button"
            role="tab"
            aria-selected={slide === index}
            aria-label={`${slide + 1}. kiemelt projekt`}
            onClick={() => onSelect(slide)}
            className="group/slide -my-5 flex h-11 items-center rounded px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
          >
            <span
              aria-hidden
              className={cn(
                'block h-0.5 rounded-full transition-all duration-base ease-out-quint',
                slide === index
                  ? 'w-16 bg-linear-to-r from-bloom-400 to-orchid-400'
                  : 'w-8 bg-ink-600 group-hover/slide:bg-ink-500',
              )}
            />
          </button>
        ))}
      </div>

      <span className="nums text-sm text-mist-500">{pad(count - 1)}</span>
    </div>
  );
}
