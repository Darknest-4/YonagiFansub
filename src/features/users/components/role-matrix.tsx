'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Lock, Save, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { InlineError } from '@/shared/ui/feedback';
import { useToast } from '@/shared/ui/toast';
import { ApiError, apiFetch } from '@/shared/api/client';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rank: number;
  color: string | null;
  isSystem: boolean;
  userCount: number;
  permissionKeys: string[];
}

export interface PermissionView {
  key: string;
  group: string;
  description: string;
}

/**
 * Permission matrix.
 *
 * One role at a time rather than a grid of every role against every permission:
 * the grid looks impressive and is unusable — 6 roles × 28 permissions is 168
 * checkboxes with no clear reading order, and every mis-click is a security
 * change.
 *
 * Two guard rails, both mirroring what the server enforces:
 *   • The owner role is displayed but not editable — it is the wildcard, and
 *     making it editable creates a way to lock everyone out.
 *   • Roles at or above the actor's own rank are read-only.
 */
export function RoleMatrix({
  roles,
  permissions,
  actorRank,
  canManage,
}: {
  roles: RoleView[];
  permissions: PermissionView[];
  actorRank: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? '');
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(roles.map((role) => [role.id, [...role.permissionKeys]])),
  );
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const role = roles.find((entry) => entry.id === selectedId);
  const granted = draft[selectedId] ?? [];

  const locked =
    !canManage || !role || role.key === 'owner' || role.rank <= actorRank;

  const dirty = role ? JSON.stringify([...granted].sort()) !== JSON.stringify([...role.permissionKeys].sort()) : false;

  const groups = permissions.reduce<Map<string, PermissionView[]>>((map, permission) => {
    const bucket = map.get(permission.group);
    if (bucket) bucket.push(permission);
    else map.set(permission.group, [permission]);
    return map;
  }, new Map());

  const toggle = (key: string) => {
    if (locked) return;
    setDraft((current) => {
      const currentKeys = current[selectedId] ?? [];
      return {
        ...current,
        [selectedId]: currentKeys.includes(key)
          ? currentKeys.filter((entry) => entry !== key)
          : [...currentKeys, key],
      };
    });
  };

  const toggleGroup = (groupPermissions: PermissionView[]) => {
    if (locked) return;
    const keys = groupPermissions.map((permission) => permission.key);
    const allOn = keys.every((key) => granted.includes(key));

    setDraft((current) => ({
      ...current,
      [selectedId]: allOn
        ? (current[selectedId] ?? []).filter((key) => !keys.includes(key))
        : [...new Set([...(current[selectedId] ?? []), ...keys])],
    }));
  };

  const save = async () => {
    if (!role) return;
    setPending(true);
    setFormError(null);

    try {
      await apiFetch(`/api/v1/admin/roles/${role.id}`, {
        method: 'PUT',
        body: {
          key: role.key,
          name: role.name,
          description: role.description ?? '',
          rank: role.rank,
          color: role.color,
          permissionKeys: granted,
        },
      });

      toast.success('Jogosultságok mentve', `${role.name}: ${granted.length} jogosultság.`);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'A mentés nem sikerült.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Szerepkörök">
        <ul className="space-y-1.5">
          {roles.map((entry) => {
            const active = entry.id === selectedId;

            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-xl border p-3.5 text-left transition-colors duration-fast',
                    active
                      ? 'border-bloom-400/35 bg-bloom-400/8'
                      : 'border-ink-800 bg-ink-900/40 hover:border-ink-600',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: entry.color ?? '#8f9bbd' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-mist-100">
                      {entry.name}
                    </span>
                    {(entry.key === 'owner' || entry.rank <= actorRank) && (
                      <Lock className="size-3 shrink-0 text-mist-600" aria-label="Nem szerkeszthető" />
                    )}
                  </span>

                  <span className="nums mt-1 block text-2xs text-mist-600">
                    rang {entry.rank} · {entry.userCount} felhasználó ·{' '}
                    {entry.key === 'owner' ? 'minden jog' : `${entry.permissionKeys.length} jog`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        {role && (
          <Card>
            <CardHeader
              title={role.name}
              description={role.description ?? undefined}
              action={
                !locked && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={save}
                    loading={pending}
                    disabled={!dirty}
                    leadingIcon={<Save className="size-3.5" aria-hidden />}
                  >
                    Mentés
                  </Button>
                )
              }
            />

            <CardBody className="space-y-5">
              {formError && <InlineError message={formError} />}

              {role.key === 'owner' ? (
                <div className="flex items-start gap-3 rounded-lg border border-bloom-400/25 bg-bloom-400/8 px-4 py-3.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-bloom-300" aria-hidden />
                  <p className="text-sm leading-relaxed text-bloom-200">
                    A tulajdonosi szerepkör minden jogosultsággal rendelkezik, és nem
                    módosítható. Ez a védőháló: enélkül egy hibás mentés kizárhatná a
                    csapatot a saját rendszeréből.
                  </p>
                </div>
              ) : locked ? (
                <div className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 px-4 py-3.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-mist-500" aria-hidden />
                  <p className="text-sm leading-relaxed text-mist-400">
                    Ez a szerepkör erősebb vagy azonos szintű a sajátoddal, ezért csak
                    megtekintheted.
                  </p>
                </div>
              ) : null}

              {[...groups.entries()].map(([group, groupPermissions]) => {
                const allOn = groupPermissions.every((permission) =>
                  role.key === 'owner' ? true : granted.includes(permission.key),
                );

                return (
                  <fieldset key={group}>
                    <legend className="mb-2.5 flex w-full items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-mist-100">{group}</span>
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupPermissions)}
                          className="text-2xs text-bloom-300 underline-offset-4 hover:underline"
                        >
                          {allOn ? 'Összes kikapcsolása' : 'Összes bekapcsolása'}
                        </button>
                      )}
                    </legend>

                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {groupPermissions.map((permission) => {
                        const on = role.key === 'owner' || granted.includes(permission.key);

                        return (
                          <li key={permission.key}>
                            <button
                              type="button"
                              onClick={() => toggle(permission.key)}
                              disabled={locked}
                              aria-pressed={on}
                              className={cn(
                                'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-fast',
                                on
                                  ? 'border-bloom-400/30 bg-bloom-400/8'
                                  : 'border-ink-800 bg-ink-900/40',
                                !locked && 'hover:border-ink-600',
                                locked && 'cursor-not-allowed opacity-70',
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                                  on
                                    ? 'border-bloom-400 bg-bloom-400 text-ink-950'
                                    : 'border-ink-600',
                                )}
                              >
                                {on && <Check className="size-3" strokeWidth={3} />}
                              </span>

                              <span className="min-w-0">
                                <span
                                  className={cn(
                                    'block text-xs',
                                    on ? 'text-mist-100' : 'text-mist-300',
                                  )}
                                >
                                  {permission.description}
                                </span>
                                <span className="block truncate font-mono text-[10px] text-mist-600">
                                  {permission.key}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
