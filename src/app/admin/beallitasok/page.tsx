import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import {
  SETTING_DEFINITIONS,
  SETTING_GROUP_LABELS,
  SETTING_GROUP_ORDER,
} from '@/features/settings/definitions';
import { getSettings } from '@/features/settings/service';
import { SettingsForm } from '@/features/settings/components/settings-form';

export const metadata: Metadata = { title: 'Beállítások' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await ensurePermission('settings:read', '/admin/beallitasok');
  const values = await getSettings();

  /*
    Sorted into the declared group order before it reaches the form.

    The form groups by walking the array, so the order the cards come out in is
    whatever order the definitions happen to sit in the object — which is the
    order somebody added them, not an order a reader would choose. Sorting here
    means a new setting can be declared next to the ones it belongs with without
    also deciding where its whole card lands on the page.
  */
  const definitions = Object.values(SETTING_DEFINITIONS)
    .map((definition) => ({
      key: definition.key,
      group: definition.group,
      label: definition.label,
      description: definition.description,
      type: definition.type,
      isPublic: definition.isPublic,
      min: 'min' in definition ? definition.min : undefined,
      max: 'max' in definition ? definition.max : undefined,
    }))
    .sort(
      (a, b) => SETTING_GROUP_ORDER.indexOf(a.group) - SETTING_GROUP_ORDER.indexOf(b.group),
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl">Beállítások</h1>
        <p className="mt-1 text-sm text-content-muted">
          Az oldal viselkedése és megjelenése. A mentés azonnal érvénybe lép.
        </p>
      </header>

      <SettingsForm
        definitions={definitions}
        initial={values as unknown as Record<string, unknown>}
        groupLabels={SETTING_GROUP_LABELS}
      />
    </div>
  );
}
