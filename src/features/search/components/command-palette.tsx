'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { apiFetch, buildQuery } from '@/shared/api/client';
import type { SearchResponse, SearchResult } from '@/features/search/service';

/**
 * Command palette / global search.
 *
 * Interaction details that make the difference between "a search box" and one
 * people actually use:
 *   • Debounced at 220 ms, with in-flight requests aborted — typing fast never
 *     leaves a slow earlier response to overwrite a newer one.
 *   • Full keyboard control: ↑/↓ across the flattened result list regardless of
 *     grouping, Enter to open, Escape to dismiss.
 *   • Suggestions when empty, so the palette is useful before a single keystroke.
 *   • An explicit "all results" row that hands off to the full search page.
 */

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const flat: SearchResult[] = results?.groups.flatMap((group) => group.results) ?? [];

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (open) return;
    // Reset on close so the next open starts clean.
    const timer = setTimeout(() => {
      setQuery('');
      setResults(null);
      setActiveIndex(0);
      setFailed(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      abortRef.current?.abort();
      return;
    }

    setLoading(true);
    setFailed(false);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await apiFetch<SearchResponse>(
          `/api/v1/search${buildQuery({ q: term, limit: 5 })}`,
          { signal: controller.signal },
        );
        setResults(response);
        setActiveIndex(0);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (flat.length === 0 ? 0 : (index + 1) % flat.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length));
        break;
      case 'Enter': {
        event.preventDefault();
        const target = flat[activeIndex];
        if (target) go(target.href);
        else if (query.trim().length >= 2) go(`/kereses${buildQuery({ q: query.trim() })}`);
        break;
      }
      default:
        break;
    }
  };

  // Keep the highlighted row in view when navigating with the keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-150 flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm"
            aria-hidden
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keresés"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
            className="relative flex max-h-[70dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-surface-overlay/97 shadow-e4 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 border-b border-ink-800 px-4">
              {loading ? (
                <Loader2 className="size-5 shrink-0 animate-spin text-bloom-400" aria-hidden />
              ) : (
                <Search className="size-5 shrink-0 text-mist-500" aria-hidden />
              )}

              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                autoComplete="off"
                spellCheck={false}
                placeholder="Keress projektre, epizódra, hírre…"
                aria-label="Keresőkifejezés"
                aria-controls="command-results"
                className="h-14 flex-1 bg-transparent text-base text-mist-50 outline-none placeholder:text-mist-600"
              />

              <button
                type="button"
                onClick={onClose}
                aria-label="Keresés bezárása"
                className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-200"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div
              id="command-results"
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            >
              {failed && (
                <p className="px-3 py-8 text-center text-sm text-danger-400">
                  A keresés most nem érhető el. Próbáld újra néhány másodperc múlva.
                </p>
              )}

              {!failed && query.trim().length < 2 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-mist-500">
                    Írj be legalább két karaktert a kereséshez.
                  </p>
                  <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-2xs text-mist-600">
                    <Shortcut>↑</Shortcut>
                    <Shortcut>↓</Shortcut>
                    <span>navigálás</span>
                    <Shortcut>
                      <CornerDownLeft className="size-3" />
                    </Shortcut>
                    <span>megnyitás</span>
                    <Shortcut>Esc</Shortcut>
                    <span>bezárás</span>
                  </p>
                </div>
              )}

              {!failed && query.trim().length >= 2 && !loading && flat.length === 0 && (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm font-medium text-mist-200">
                    Nincs találat erre: „{query.trim()}”
                  </p>
                  <p className="mt-1.5 text-xs text-mist-500">
                    Próbálj rövidebb kifejezést, vagy nézd meg a teljes katalógust.
                  </p>
                </div>
              )}

              {results?.groups.map((group) => (
                <section key={group.type} className="mb-1">
                  <h3 className="px-3 pt-3 pb-1.5 text-2xs font-bold tracking-[0.16em] text-mist-600 uppercase">
                    {group.label}
                  </h3>
                  <ul>
                    {group.results.map((result) => {
                      const index = flat.indexOf(result);
                      const active = index === activeIndex;

                      return (
                        <li key={`${result.type}-${result.id}`}>
                          <button
                            type="button"
                            data-index={index}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => go(result.href)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-instant',
                              active ? 'bg-bloom-400/12' : 'hover:bg-ink-800',
                            )}
                          >
                            <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-ink-800">
                              {result.imageUrl && (
                                <Image
                                  src={result.imageUrl}
                                  alt=""
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              )}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  'block truncate text-sm font-medium',
                                  active ? 'text-bloom-100' : 'text-mist-100',
                                )}
                              >
                                {result.title}
                              </span>
                              {result.subtitle && (
                                <span className="block truncate text-xs text-mist-500">
                                  {result.subtitle}
                                </span>
                              )}
                            </span>

                            {active && (
                              <ArrowRight className="size-4 shrink-0 text-bloom-300" aria-hidden />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {query.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => go(`/kereses${buildQuery({ q: query.trim() })}`)}
                className="flex items-center justify-between gap-3 border-t border-ink-800 px-4 py-3 text-sm text-mist-300 transition-colors hover:bg-ink-850 hover:text-mist-100"
              >
                <span>
                  Minden találat megtekintése erre: <strong className="text-bloom-300">{query.trim()}</strong>
                </span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Shortcut({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-400">
      {children}
    </kbd>
  );
}
