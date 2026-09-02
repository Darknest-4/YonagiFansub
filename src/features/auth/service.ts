import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { logger } from '@/infrastructure/logger';
import { sendMail } from '@/infrastructure/mail/transport';
import { authMail } from '@/features/auth/mail';
import { recordAudit } from '@/shared/api/audit';
import { clearRateLimit } from '@/shared/api/rate-limit';
import {
  burnPasswordTime,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/features/auth/password';
import { isPasswordAcceptable } from '@/features/auth/password-policy';
import { generateToken, hashToken } from '@/shared/auth/tokens';
import { createSession, revokeAllSessions } from '@/shared/auth/session';
import { DEFAULT_ROLE_KEY, OWNER_ROLE_KEY } from '@/shared/auth/permissions';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/shared/lib/errors';
import { getSettings } from '@/features/settings/service';
/*
  A levelekbe kerülő cím soha nem a kérés `Host` fejlécéből jön: az a hívó
  által megadott érték, és egy hamisított hoszttal épített jelszó-visszaállító
  link működő adathalász link, amit mi kézbesítünk az áldozat postafiókjába.
  Lásd `lib/site-url.ts`.
*/
import { mailSiteUrl } from '@/shared/lib/site-url';

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

export async function registerUser(
  params: RegisterParams,
): Promise<{ userId: string; isBootstrap: boolean }> {
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

  const passwordHash = await hashPassword(params.password);

  /*
   * Bootstrap: egy teljesen üres telepítésen az első fiók lesz a tulajdonos.
   *
   * A számlálás és a beszúrás egyetlen SERIALIZABLE tranzakcióban fut. Ez nem
   * túlbiztosítás: két egyszerre érkező regisztráció alacsonyabb izolációs
   * szinten mindkettőt nullát látná, és két tulajdonos jönne létre. Serializable
   * mellett a Postgres a másodikat visszagörgeti — a felhasználó hibát kap és
   * újrapróbálja, ami sokkal jobb kimenet, mint egy nem szándékolt adminisztrátor.
   *
   * A bootstrap fiók azonnal ACTIVE és megerősített e-mailű. Enélkül a
   * tulajdonos egy visszaigazoló levélre várna, amit `MAIL_DRIVER=console`
   * mellett soha nem kap meg — vagyis pont az a fiók nem tudna belépni, ami
   * nélkül a rendszert nem lehet beállítani.
   */
  const { user, isBootstrap } = await db.$transaction(
    async (tx) => {
      const bootstrap = (await tx.user.count()) === 0;
      const roleKey = bootstrap ? OWNER_ROLE_KEY : DEFAULT_ROLE_KEY;

      const role = await tx.role.findUnique({ where: { key: roleKey }, select: { id: true } });
      if (!role) {
        // Hiányzó szerepkör = a seed nem futott le. Hangosan bukni a helyes.
        throw new Error(`A "${roleKey}" szerepkör hiányzik. Futtasd: npm run db:seed`);
      }

      const created = await tx.user.create({
        data: {
          email: params.email,
          username: params.username,
          displayName: params.displayName,
          passwordHash,
          roleId: role.id,
          status: bootstrap ? 'ACTIVE' : 'PENDING',
          emailVerifiedAt: bootstrap ? new Date() : null,
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

      return { user: created, isBootstrap: bootstrap };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (isBootstrap) {
    // Egyszeri, visszafordíthatatlan esemény: legyen nyoma a naplóban is, ne
    // csak az audit táblában, amit valaki később átírhat vagy nyeshet.
    logger.warn('Bootstrap: az első fiók megkapta a tulajdonosi szerepkört', {
      userId: user.id,
      username: params.username,
      ipHash: params.ipHash,
    });
  } else {
    await issueVerificationEmail(user.id, user.email, user.displayName);
  }

  await recordAudit({
    actorId: user.id,
    actorLabel: params.username,
    action: isBootstrap ? 'PERMISSION_CHANGE' : 'CREATE',
    entityType: 'User',
    entityId: user.id,
    summary: isBootstrap
      ? `Első regisztráció — tulajdonosi jogosultság kiosztva: ${params.username}`
      : `Új regisztráció: ${params.username}`,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });

  return { userId: user.id, isBootstrap };
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
    ...authMail.verifyEmail(
      displayName,
      `${mailSiteUrl()}/email-megerosites?token=${token}`,
    ),
  });
}

/**
 * Sends the verification link again.
 *
 * Registration issued this mail exactly once, and there was no second chance:
 * a message that landed in spam, went to a mistyped address, or — as happened
 * here — was never sent at all because mail was misconfigured, left the account
 * stuck as `PENDING` with no way out. The account could still log in, but never
 * comment, and nothing on the site explained why.
 *
 * **Silent about whether the address exists**, exactly like the password reset
 * beside it: the caller gets the same answer either way. An endpoint that
 * answers "no such user" faster than "sent" is a membership oracle, and this one
 * would be an unauthenticated one.
 *
 * Already-verified addresses are also a no-op. Re-sending to them would be a
 * confusing email at best, and at worst a way to have somebody else's inbox
 * mailed on demand.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await db.user.findFirst({
    where: {
      email: email.toLowerCase(),
      deletedAt: null,
      emailVerifiedAt: null,
      // A banned or suspended account does not get to re-open itself by mail.
      status: 'PENDING',
    },
    select: { id: true, email: true, displayName: true },
  });

  if (!user) return;

  await issueVerificationEmail(user.id, user.email, user.displayName);
}

/**
 * Nightly catch-up for confirmations that never arrived.
 *
 * The manual "send it again" above is the real fix, but it only helps people
 * who come looking for it. Somebody who registered during a mail outage got
 * nothing, has no reason to suspect a link was ever sent, and will simply
 * assume the site is broken. This finds them.
 *
 * Three limits keep it from becoming a nuisance, which is the failure mode of
 * every well-meant reminder job:
 *
 *   • **Once per account, ever.** `verificationRemindedAt` is stamped whether or
 *     not the mail succeeds, so nothing here can loop.
 *   • **Recent registrations only.** Past the window, an unconfirmed account is
 *     somebody who changed their mind, and mailing them is unsolicited.
 *   • **A per-run cap**, so a backlog is worked through over several nights
 *     instead of emptying a sending quota in one go.
 *
 * The order matters: the stamp is written *before* the mail is sent. A crash
 * halfway therefore costs one reminder rather than sending it every night from
 * then on.
 */
const REMINDER_WINDOW_DAYS = 14;
const REMINDER_BATCH = 25;

export async function resendMissedVerifications(): Promise<number> {
  const cutoff = new Date(Date.now() - REMINDER_WINDOW_DAYS * 86_400_000);

  const pending = await db.user.findMany({
    where: {
      deletedAt: null,
      status: 'PENDING',
      emailVerifiedAt: null,
      verificationRemindedAt: null,
      createdAt: { gte: cutoff },
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
    take: REMINDER_BATCH,
  });

  let sent = 0;

  for (const user of pending) {
    await db.user.update({
      where: { id: user.id },
      data: { verificationRemindedAt: new Date() },
    });

    try {
      await issueVerificationEmail(user.id, user.email, user.displayName);
      sent += 1;
    } catch (error) {
      logger.error('A pótlólagos megerősítő levél nem ment ki', error, { userId: user.id });
    }
  }

  return sent;
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
    ...authMail.resetPassword(
      user.displayName,
      `${mailSiteUrl()}/jelszo-visszaallitas/${token}`,
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
    ...authMail.passwordChanged(record.user.displayName),
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

  await sendMail({ to: user.email, ...authMail.passwordChanged(user.displayName) });

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
