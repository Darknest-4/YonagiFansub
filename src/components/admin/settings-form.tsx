'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Switch, Textarea } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

export interface SettingDefinitionView {
  key: string;
  group: string;
  label: string;
  description?: string;
  type: 'string' | 'text' | 'boolean' | 'number' | 'url' | 'email';
  isPublic: boolean;
}

/**
 * Site settings form.
 *
 * Rendered entirely from the server's setting definitions rather than from
 * hand-written JSX per field: adding a setting in `server/settings.ts` makes it
 * appear here automatically, with the right control for its type. That is what
 * keeps the two from drifting apart.
 *
 * Settings that change what visitors see (maintenance mode, registration) get an
 * explicit warning, because those are the ones where a mis-click is visible to
 * the whole internet within seconds.
 */
export function SettingsForm({
  definitions,
  initial,
  groupLabels,
}: {
  definitions: SettingDefinitionView[];
  initial: Record<string, unknown>;
  groupLabels: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const groups = definitions.reduce<Map<string, SettingDefinitionView[]>>((map, definition) => {
    const bucket = map.get(definition.group);
    if (bucket) bucket.push(definition);
    else map.set(definition.group, [definition]);
    return map;
  }, new Map());

  const save = async () => {
    setPending(true);
    setFormError(null);

    try {
      await apiFetch('/api/v1/admin/settings', { method: 'PUT', body: { values } });
      toast.success('Beállítások mentve', 'A változás azonnal él a nyilvános oldalon.');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'A mentés nem sikerült. Próbáld újra.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      {formError && <InlineError message={formError} />}

      {values.maintenanceMode === true && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-warning-500/30 bg-warning-900/25 px-4 py-3"
        >
          <AlertTriangle className="size-5 shrink-0 text-warning-400" aria-hidden />
          <p className="text-sm text-warning-400">
            A karbantartási mód be van kapcsolva: a látogatók karbantartási oldalt látnak.
            Az admin felület elérhető marad.
          </p>
        </div>
      )}

      {[...groups.entries()].map(([group, items]) => (
        <Card key={group}>
          <CardHeader title={groupLabels[group] ?? group} />
          <CardBody className="space-y-5">
            {items.map((definition) => (
              <SettingControl
                key={definition.key}
                definition={definition}
                value={values[definition.key]}
                onChange={(value) => setValues({ ...values, [definition.key]: value })}
              />
            ))}
          </CardBody>
        </Card>
      ))}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur-lg">
        <Button
          variant="primary"
          size="md"
          onClick={save}
          loading={pending}
          disabled={!dirty}
          leadingIcon={<Save className="size-4" aria-hidden />}
        >
          Mentés
        </Button>

        {dirty && (
          <Button variant="ghost" size="md" onClick={() => setValues(initial)} disabled={pending}>
            Változtatások elvetése
          </Button>
        )}

        <span className="ml-auto text-2xs text-mist-600">
          {dirty ? 'Mentetlen változtatások' : 'Minden mentve'}
        </span>
      </div>
    </div>
  );
}

function SettingControl({
  definition,
  value,
  onChange,
}: {
  definition: SettingDefinitionView;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (definition.type === 'boolean') {
    return (
      <Switch
        checked={value === true}
        onChange={onChange}
        label={definition.label}
        description={definition.description}
      />
    );
  }

  if (definition.type === 'text') {
    return (
      <Field label={definition.label} hint={definition.description}>
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            rows={3}
            value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
          />
        )}
      </Field>
    );
  }

  const inputType =
    definition.type === 'url' ? 'url' : definition.type === 'email' ? 'email' : 'text';

  return (
    <Field label={definition.label} hint={definition.description}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          type={inputType}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
        />
      )}
    </Field>
  );
}
