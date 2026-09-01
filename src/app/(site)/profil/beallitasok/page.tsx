import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { ensureAuthenticated } from '@/lib/auth/guards';
import {
  PasswordForm,
  PreferencesForm,
  ProfileForm,
  type PreferenceValues,
} from '@/components/account/settings-forms';
import { SessionList } from '@/components/account/session-list';
import { VerifyEmailCard } from '@/components/account/verify-email-card';
import { DataRightsCard } from '@/components/account/data-rights-card';

export const metadata: Metadata = {
  title: 'Beállítások',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PREFERENCE_DEFAULTS: PreferenceValues = {
  notifyNewRelease: true,
  notifyNewsPost: true,
  notifyCommentReply: true,
  emailDigest: 'off',
  reducedMotion: false,
};

export default async function SettingsPage() {
  const user = await ensureAuthenticated('/profil/beallitasok');

  const [profile, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { username: true, displayName: true, bio: true, avatarUrl: true },
    }),
    db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 10,
      select: { id: true, userAgent: true, lastUsedAt: true, createdAt: true },
    }),
  ]);

  const stored = (user.preferences ?? {}) as Partial<PreferenceValues>;
  const preferences: PreferenceValues = { ...PREFERENCE_DEFAULTS, ...stored };

  return (
    <div className="space-y-6">
      {/* First, because for an unconfirmed account it is the only thing on this
          page that matters — half the features are off until it is done. */}
      {!user.emailVerifiedAt && <VerifyEmailCard email={user.email} />}

      <ProfileForm
        initial={{
          displayName: profile.displayName,
          bio: profile.bio ?? '',
          avatarUrl: profile.avatarUrl ?? '',
        }}
      />

      <PreferencesForm initial={preferences} />

      <PasswordForm />

      <SessionList
        sessions={sessions.map((session) => ({
          id: session.id,
          userAgent: session.userAgent,
          lastUsedAt: session.lastUsedAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
        }))}
      />

      {/* Last, and deliberately so: everything above is a change you can undo. */}
      <DataRightsCard username={profile.username} />
    </div>
  );
}
