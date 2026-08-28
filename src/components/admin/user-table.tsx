'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { UserStatus } from '@prisma/client';
import { Lock, Pencil, UserCog } from 'lucide-react';
import { formatDate, formatRelative } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/admin/data-table';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roleId: string;
  roleName: string;
  roleRank: number;
  roleColor: string | null;
  /** The actor's own account — editable from profile settings, not from here. */
  isSelf: boolean;
  /** Decided server-side with the same rule the write path enforces. */
  editable: boolean;
}

export const USER_STATUS: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Aktív', tone: 'success' },
  PENDING: { label: 'Megerősítésre vár', tone: 'warning' },
  SUSPENDED: { label: 'Felfüggesztve', tone: 'warm' },
  BANNED: { label: 'Kitiltva', tone: 'danger' },
};

/**
 * User administration table.
 *
 * Editing happens in a dialog rather than on a separate page: the editable
 * surface is three fields, and keeping the list visible behind the dialog makes
 * "who else is in this role" answerable without navigating away.
 *
 * The role dropdown is filtered to roles the actor may actually grant. The
 * server enforces the same rule — this is here so the UI does not offer an
 * option that will be refused.
 */
export function AdminUserTable({
  rows,
  meta,
  roles,
  canWrite,
  emptyState,
}: {
  rows: AdminUserRow[];
  meta: { page?: number; totalPages?: number; total?: number; perPage?: number };
  /** Already narrowed to the roles this actor may grant. */
  roles: Array<{ id: string; name: string; rank: number }>;
  canWrite: boolean;
  emptyState: ReactNode;
}) {
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'Felhasználó',
      render: (row) => (
        <span className="flex items-center gap-3">
          <Avatar name={row.displayName} src={row.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate">{row.displayName}</span>
            <span className="block truncate font-mono text-2xs text-mist-600">
              @{row.username}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      secondary: true,
      render: (row) => (
        <span className="flex items-center gap-1.5 text-xs text-mist-400">
          <span className="truncate">{row.email}</span>
          {!row.emailVerified && (
            <span title="Nincs megerősítve" aria-label="Nincs megerősítve">
              <Badge tone="warning" size="sm">
                !
              </Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Szerepkör',
      width: '9rem',
      render: (row) => (
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-2xs font-medium"
          style={{
            color: row.roleColor ?? '#8f9bbd',
            backgroundColor: `color-mix(in oklab, ${row.roleColor ?? '#8f9bbd'} 12%, transparent)`,
          }}
        >
          {row.roleName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Státusz',
      width: '10rem',
      render: (row) => (
        <Badge tone={USER_STATUS[row.status].tone}>{USER_STATUS[row.status].label}</Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Utolsó belépés',
      sortable: true,
      width: '9rem',
      align: 'right',
      secondary: true,
      render: (row) => (
        <span className="text-2xs text-mist-500">
          {row.lastLoginAt ? formatRelative(row.lastLoginAt) : 'soha'}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            width: '8rem',
            align: 'right' as const,
            render: (row: AdminUserRow) => {
              if (row.editable) {
                return (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(row)}
                    aria-label={`${row.displayName} szerkesztése`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                );
              }

              /*
                A greyed-out icon with a `title` says nothing on a touch screen,
                where there is no hover — and "why can't I click this" was the
                actual complaint. So the reason is written out, and for your own
                account it becomes the link to the page that can change it.
              */
              if (row.isSelf) {
                return (
                  <Link
                    href="/profil/beallitasok"
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-mist-400 transition-colors hover:text-bloom-300"
                  >
                    <UserCog className="size-3.5 shrink-0" aria-hidden />
                    Saját fiók
                  </Link>
                );
              }

              return (
                <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-2xs text-mist-600">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  Magasabb rang
                </span>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        meta={meta}
        basePath="/admin/felhasznalok"
        searchPlaceholder="Név, felhasználónév, e-mail…"
        emptyState={emptyState}
      />

      {editing && (
        <UserDialog
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function UserDialog({
  user,
  roles,
  onClose,
}: {
  user: AdminUserRow;
  roles: Array<{ id: string; name: string; rank: number }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [values, setValues] = useState({
    displayName: user.displayName,
    status: user.status,
    roleId: user.roleId,
    bio: user.bio ?? '',
  });

  const statusChanged = values.status !== user.status;
  const willRevokeSessions = values.status === 'SUSPENDED' || values.status === 'BANNED';

  const submit = async () => {
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      await apiFetch(`/api/v1/admin/users/${user.id}`, { method: 'PUT', body: values });
      toast.success('Felhasználó mentve');
      onClose();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        setFormError(Object.keys(error.fields).length === 0 ? error.message : null);
      } else {
        setFormError('Váratlan hiba történt.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user.displayName}
      description={`@${user.username} · regisztrált ${formatDate(user.createdAt)}`}
      size="md"
      dismissible={!pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Mégse
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending}>
            Mentés
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <InlineError message={formError} />}

        <Field label="Megjelenített név" required error={fieldErrors.displayName}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={values.displayName}
              onChange={(event) => setValues({ ...values, displayName: event.target.value })}
              invalid={invalid}
            />
          )}
        </Field>

        <Field
          label="Szerepkör"
          required
          hint="Csak a sajátodnál gyengébb szerepkört adhatsz."
          error={fieldErrors.roleId}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              value={values.roleId}
              onChange={(event) => setValues({ ...values, roleId: event.target.value })}
              aria-describedby={describedBy}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
              {!roles.some((role) => role.id === user.roleId) && (
                <option value={user.roleId} disabled>
                  {user.roleName} (nem módosíthatod)
                </option>
              )}
            </Select>
          )}
        </Field>

        <Field label="Státusz" required error={fieldErrors.status}>
          {({ id }) => (
            <Select
              id={id}
              value={values.status}
              onChange={(event) =>
                setValues({ ...values, status: event.target.value as UserStatus })
              }
            >
              {Object.entries(USER_STATUS).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {statusChanged && willRevokeSessions && (
          <p className="rounded-lg border border-warning-500/25 bg-warning-900/25 px-3.5 py-2.5 text-xs text-warning-400">
            A mentéssel minden aktív munkamenete azonnal érvénytelenné válik.
          </p>
        )}
      </div>
    </Modal>
  );
}
