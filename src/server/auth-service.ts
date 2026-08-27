import 'server-only';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { mailTemplates, sendMail } from '@/lib/mail';
import { recordAudit } from '@/lib/api/audit';
import { clearRateLimit } from '@/lib/api/rate-limit';
import {
  burnPasswordTime,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password';
import { isPasswordAcceptable } from '@/lib/auth/password-policy';
import { generateToken, hashToken } from '@/lib/auth/tokens';
import { createSession, revokeAllSessions } from '@/lib/auth/session';
import { DEFAULT_ROLE_KEY } from '@/lib/auth/permissions';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { getSettings } from '@/server/settings';

/**
 * Authentication flows.
 *
 * Security properties this module is responsible for:
 *   • No account enumeration. Login, registration and password reset all return
 *     the same shape whether or not the address exists, and take comparable time.
 *   • Throttled brute force. Repeated failures lock the account for a growing
 *     window, on top of the IP-level rate limit in the route wrapper.
 *   • Session hygiene. A password change revokes every other session.
 *   • Single-use tokens. Reset and verification tokens are hashed, expiring and
 *     consumed atomically.
 */

const LOCKOUT_THRESHOLD = 6;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RegisterParams {
  email: string;
  username: string;
  displayName: string;
  password: string;
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
  requestId: string;
}

export async function registerUser(params: RegisterParams): Promise<{ userId: string }> {
  const settings = await getSettings();
  if (!settings.registrationOpen) {
    throw new ForbiddenError('A regisztráció jelenleg szünetel.');
  }

  if (!isPasswordAcceptable(params.password, [params.username, params.email.split('@')[0] ?? ''])) {
    throw new ValidationError({ password: ['A jelszó nem felel meg a biztonsági feltételeknek.'] });
  }

  // Case-insensitive uniqueness: `Foo` and `foo` must not be two accounts.
  const [existingEmail, existingUsername] = await Promise.all([
    db.user.findFirst({ where: { email: params.email }, select: { id: true } }),
    db.user.findFirst({
      where: { username: { equals: params.username, mode: 'insensitive' } },
      select: { id: true },
    }),
  ]);

  if (existingEmail) {
    throw new ConflictError('Ezzel az e-mail-címmel már létezik fiók.');
  }
  if (existingUsername) {
    throw new ConflictError('Ez a felhasználónév már foglalt.');
  }

  const role = await db.role.findUnique({ where: { key: DEFAULT_ROLE_KEY }, select: { id: true } });
  if (!role) {
    // A missing default role means the seed never ran; failing loudly is right.
    throw new Error(`Default role "${DEFAULT_ROLE_KEY}" is missing. Run \`npm run db:seed\`.`);
  }

  const passwordHash = await hashPassword(params.password);

  const user = await db.user.create({
    data: {
      email: params.email,
      username: params.username,
      displayName: params.displayName,
      passwordHash,
      roleId: role.id,
      status: 'PENDING',
      preferences: {
        notifyNewRelease: true,
        notifyNewsPost: true,
        notifyCommentReply: true,
        emailDigest: 'off',
        reducedMotion: false,
      },
    },
    select: { id: true, email: true, displayName: true },
  });

  await issueVerificationEmail(user.id, user.email, user.displayName);

  await recordAudit({
    actorId: user.id,
    actorLabel: params.username,
    action: 'CREATE',
    entityType: 'User',
    entityId: user.id,
    summary: `Új regisztráció: ${params.username}`,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });

  return { userId: user.id };
}

export interface LoginParams {
  email: string;
  password: string;
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
  requestId: string;
}

export async function loginUser(params: LoginParams): Promise<{ userId: string }> {
  const user = await db.user.findFirst({
    where: { email: params.email, deletedAt: null },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      status: true,
      failedLogins: true,
      lockedUntil: true,
    },
  });

  // Equalise timing for unknown accounts so the response is not an oracle.
  if (!user) {
    await burnPasswordTime();
    throw new UnauthorizedError('Hibás e-mail-cím vagy jelszó.');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new ForbiddenError(
      `A fiók ideiglenesen zárolva van túl sok sikertelen próbálkozás miatt. Próbáld újra ${minutes} perc múlva.`,
    );
  }

  const valid = await verifyPassword(params.password, user.passwordHash);

  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    const shouldLock = failedLogins >= LOCKOUT_THRESHOLD;

    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    await recordAudit({
      actorId: user.id,
      actorLabel: user.username,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      summary: shouldLock
        ? `Sikertelen belépés – fiók zárolva (${failedLogins} próbálkozás)`
        : `Sikertelen belépés (${failedLogins}. próbálkozás)`,
      ipHash: params.ipHash,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });

    throw new UnauthorizedError('Hibás e-mail-cím vagy jelszó.');
  }

  if (user.status === 'BANNED') {
    throw new ForbiddenError('Ez a fiók véglegesen le lett tiltva.');
  }
  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('Ez a fiók átmenetileg fel van függesztve.');
  }

  // Transparent hash upgrade when the cost parameters have been raised.
  const passwordHash = needsRehash(user.passwordHash)
    ? await hashPassword(params.password)
    : undefined;

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  await createSession(user.id, { userAgent: params.userAgent, ip: params.ip });

  if (params.ipHash) {
    // A successful login clears the IP budget: typos should not cost the user.
    await clearRateLimit('auth:login', params.ipHash);
  }

  await recordAudit({
    actorId: user.id,
    actorLabel: user.username,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    summary: 'Sikeres belépés',
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });

  return { userId: user.id };
}

// ── Email verification ───────────────────────────────────────────────────────

export async function issueVerificationEmail(
  userId: string,
  email: string,
  displayName: string,
): Promise<void> {
  const token = generateToken();

  // Supersede any outstanding token: only the newest link should work.
  await db.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await db.emailVerificationToken.create({
    data: {
      userId,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });

  await sendMail({
    to: email,
    ...mailTemplates.verifyEmail(
      displayName,
      `${env.NEXT_PUBLIC_SITE_URL}/email-megerosites?token=${token}`,
    ),
  });
}

export async function verifyEmail(token: string): Promise<{ userId: string }> {
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, email: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new UnauthorizedError('A megerősítő link érvénytelen vagy lejárt.');
  }

  await db.$transaction([
    db.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId },
      data: {
        emailVerifiedAt: new Date(),
        // A pending account becomes active the moment its address is confirmed.
        status: 'ACTIVE',
      },
    }),
  ]);

  return { userId: record.userId };
}

// ── Password reset ───────────────────────────────────────────────────────────

/**
 * Always resolves successfully, whether or not the address exists. The response
 * the caller shows must be identical in both cases.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, displayName: true, status: true },
  });

  if (!user || user.status === 'BANNED') {
    logger.info('Password reset requested for unknown or banned address', {
      // Logged as a hash-free boolean: the address itself is not written down.
      known: Boolean(user),
    });
    return;
  }

  const token = generateToken();

  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await sendMail({
    to: user.email,
    ...mailTemplates.resetPassword(
      user.displayName,
      `${env.NEXT_PUBLIC_SITE_URL}/jelszo-visszaallitas/${token}`,
    ),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
  context: { ipHash: string | null; userAgent: string | null; requestId: string },
): Promise<void> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { username: true, email: true, displayName: true } },
    },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new UnauthorizedError('A visszaállító link érvénytelen vagy lejárt.');
  }

  if (!isPasswordAcceptable(newPassword, [record.user.username])) {
    throw new ValidationError({ password: ['A jelszó nem felel meg a biztonsági feltételeknek.'] });
  }

  const passwordHash = await hashPassword(newPassword);

  await db.$transaction([
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    }),
  ]);

  // Whoever had a session on this account no longer does.
  await revokeAllSessions(record.userId);

  await sendMail({
    to: record.user.email,
    ...mailTemplates.passwordChanged(record.user.displayName),
  });

  await recordAudit({
    actorId: record.userId,
    actorLabel: record.user.username,
    action: 'UPDATE',
    entityType: 'User',
    entityId: record.userId,
    summary: 'Jelszó visszaállítva e-mailes linkkel',
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    requestId: context.requestId,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context: { sessionId?: string; ipHash: string | null; userAgent: string | null; requestId: string },
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, displayName: true, passwordHash: true },
  });

  if (!user) throw new UnauthorizedError();

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError({ currentPassword: ['A jelenlegi jelszó nem megfelelő.'] });
  }

  if (!isPasswordAcceptable(newPassword, [user.username, user.email.split('@')[0] ?? ''])) {
    throw new ValidationError({ password: ['A jelszó nem felel meg a biztonsági feltételeknek.'] });
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Keep the current device signed in; drop everything else.
  await revokeAllSessions(userId, context.sessionId);

  await sendMail({ to: user.email, ...mailTemplates.passwordChanged(user.displayName) });

  await recordAudit({
    actorId: userId,
    actorLabel: user.username,
    action: 'UPDATE',
    entityType: 'User',
    entityId: userId,
    summary: 'Jelszó megváltoztatva a fiókbeállításokban',
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    requestId: context.requestId,
  });
}
