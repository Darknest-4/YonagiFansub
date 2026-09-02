'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local draft autosave.
 *
 * Long admin forms (a project has ~25 fields, a release has links) are exactly
 * where a stray reload or a closed tab costs real work. This hook mirrors the
 * form state into `localStorage` on a debounce and offers it back on the next
 * mount.
 *
 * Two deliberate choices:
 *   • The draft is *offered*, never auto-applied. Silently restoring stale data
 *     over a record someone else edited is worse than losing a draft.
 *   • It clears on successful submit, so the next visit starts from the server's
 *     state rather than from a draft that is now the past.
 *
 * `localStorage` can throw (Safari private mode, storage disabled), so every
 * access is guarded — a failing autosave must never break the form itself.
 */

const PREFIX = 'yonagi:draft:';
const DEBOUNCE_MS = 800;
/** Drafts older than this are ignored: they are almost certainly abandoned. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  savedAt: number;
  values: T;
}

export interface FormDraft<T> {
  /** A recovered draft, if one exists and is fresh. Never applied automatically. */
  recovered: { values: T; savedAt: Date } | null;
  /** Timestamp of the last successful autosave, for the "saved" indicator. */
  savedAt: Date | null;
  save: (values: T) => void;
  discard: () => void;
  clear: () => void;
}

export function useFormDraft<T>(key: string, enabled = true): FormDraft<T> {
  const storageKey = `${PREFIX}${key}`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recovered, setRecovered] = useState<{ values: T; savedAt: Date } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as StoredDraft<T>;
      if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      setRecovered({ values: parsed.values, savedAt: new Date(parsed.savedAt) });
    } catch {
      // Corrupt or inaccessible storage: proceed without a draft.
    }
  }, [storageKey, enabled]);

  const save = useCallback(
    (values: T) => {
      if (!enabled) return;
      if (timer.current) clearTimeout(timer.current);

      timer.current = setTimeout(() => {
        try {
          const payload: StoredDraft<T> = { savedAt: Date.now(), values };
          window.localStorage.setItem(storageKey, JSON.stringify(payload));
          setSavedAt(new Date());
        } catch {
          // Quota exceeded or storage disabled – autosave is best-effort.
        }
      }, DEBOUNCE_MS);
    },
    [storageKey, enabled],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setSavedAt(null);
    setRecovered(null);
  }, [storageKey]);

  const discard = useCallback(() => {
    setRecovered(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { recovered, savedAt, save, discard, clear };
}
