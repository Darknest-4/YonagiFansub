import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import {
  SETTING_DEFINITIONS,
  SETTING_GROUP_LABELS,
  getSettings,
} from '@/server/settings';
import { SettingsForm } from '@/components/admin/settings-form';

export const metadata: Metadata = { title: 'Beállítások' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await ensurePermission('settings:read', '/admin/beallitasok');
  const values = await getSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl">Beállítások</h1>
        <p className="mt-1 text-sm text-content-muted">
          Az oldal viselkedése és megjelenése. A mentés azonnal érvénybe lép.
        </p>
      </header>

      <SettingsForm
        definitions={Object.values(SETTING_DEFINITIONS).map((definition) => ({
          key: definition.key,
          group: definition.group,
          label: definition.label,
          description: definition.description,
          type: definition.type,
          isPublic: definition.isPublic,
        }))}
        initial={values as unknown as Record<string, unknown>}
        groupLabels={SETTING_GROUP_LABELS}
      />
    </div>
  );
}
