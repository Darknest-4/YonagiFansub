'use client';

import { useEffect, useState } from 'react';

/**
 * Where the page is scrolled, sampled cheaply enough to drive an animation.
 *
 * ## Why a hook rather than a CSS scroll-driven animation
 *
 * `animation-timeline: scroll()` would do the shrinking in the compositor with
 * no JavaScript at all, which is the better answer — except Safari still does
 * not ship it, and Safari on iOS is most of this component's audience. A rAF-
 * throttled passive listener is the version that works for everyone.
 *
 * ## Hysteresis
 *
 * The compact threshold is not a single line. A bar that switches size at
 * exactly 80px flickers the whole time somebody hovers around that offset,
 * which on a phone is the entire first flick of a scroll. Compacting at 80 and
 * expanding again at 40 gives the state somewhere to sit.
 */

const COMPACT_AT = 80;
const EXPAND_AT = 40;

export interface ScrollState {
  /** Past the compact threshold: the bar should take less room. */
  compact: boolean;
  /** Far enough down that "back to top" is the useful direction. */
  scrolled: boolean;
}

export function useScrollState(): ScrollState {
  const [state, setState] = useState<ScrollState>({ compact: false, scrolled: false });

  useEffect(() => {
    let frame = 0;

    const sample = () => {
      frame = 0;
      const y = window.scrollY;

      setState((current) => {
        const compact = current.compact ? y > EXPAND_AT : y > COMPACT_AT;
        const scrolled = y > COMPACT_AT;

        // Returning the same object keeps React from re-rendering the bar on
        // every frame of a long scroll.
        return compact === current.compact && scrolled === current.scrolled
          ? current
          : { compact, scrolled };
      });
    };

    const onScroll = () => {
      // One sample per frame at most. A scroll event can fire far more often
      // than the screen refreshes, and every extra sample is work thrown away.
      if (frame === 0) frame = requestAnimationFrame(sample);
    };

    sample();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}

/**
 * Smooth scroll that honours the reduced-motion setting.
 *
 * `scroll-behavior: smooth` in CSS is overridden for reduced motion in
 * `globals.css`; `window.scrollTo({ behavior: 'smooth' })` is not — it ignores
 * the stylesheet entirely, so the check has to be made here or somebody who
 * asked the system for less movement gets a full-page glide anyway.
 */
export function scrollToY(top: number): void {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}
