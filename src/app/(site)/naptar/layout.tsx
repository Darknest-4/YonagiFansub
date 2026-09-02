import { notFound } from 'next/navigation';
import { getSettings } from '@/features/settings/service';

/**
 * The `scheduleEnabled` gate. In the layout for the same reason as the
 * changelog's — see `app/(site)/fejlesztes/layout.tsx` for the measurement:
 * a `notFound()` in a page that has a `loading.tsx` above it produces a soft
 * 404, because the shell has already been flushed with a 200.
 */
export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  if (!settings.scheduleEnabled) notFound();

  return children;
}
