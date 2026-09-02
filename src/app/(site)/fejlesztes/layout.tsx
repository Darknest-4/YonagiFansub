import { notFound } from 'next/navigation';
import { getSettings } from '@/server/settings';

/**
 * The `changelogEnabled` gate, in a layout rather than in the page.
 *
 * This looks like misplacement and is not. The segment has a `loading.tsx`, so
 * Next wraps the *page* in a Suspense boundary and flushes the shell — headers
 * and all — the moment the layout resolves. A `notFound()` raised in the page
 * therefore arrives after the status line has already gone out: the visitor
 * sees the not-found body under a **200**, which is a soft 404. Search engines
 * treat that as a real page and keep it indexed, which is the one thing turning
 * the feature off was supposed to prevent.
 *
 * Measured, not assumed: with the page holding the check, `/fejlesztes` answered
 * 200 with the not-found body; with the check here, 404 — and the skeleton still
 * appears on the enabled path.
 *
 * The layout is not inside that boundary, so it runs before anything is
 * committed and `notFound()` can still set the status.
 */
export default async function ChangelogLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  if (!settings.changelogEnabled) notFound();

  return children;
}
