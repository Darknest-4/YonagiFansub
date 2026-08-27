import 'server-only';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '@/lib/env';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * scrypt from Node's core crypto module: memory-hard, no native build step, no
 * supply-chain surface. Parameters are encoded into the hash string, so the cost
 * can be raised later and existing hashes keep verifying — `needsRehash()` tells
 * the login flow when to transparently upgrade a user's stored hash.
 *
 * The encoded format is `scrypt$N$r$p$salt$key` with base64url segments. Moving
 * to argon2id later means adding an `argon2id$…` branch to `verifyPassword`.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const R = 8;
const P = 1;

function params() {
  const N = 2 ** env.AUTH_SCRYPT_LOG_N;
  return { N, r: R, p: P, maxmem: 256 * N * R };
}

export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, maxmem } = params();
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters from a tampered row instead of allocating gigabytes.
  if (N < 2 ** 12 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH || salt.length === 0) return false;

  const actual = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });

  return timingSafeEqual(actual, expected);
}

/** True when the stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < 2 ** env.AUTH_SCRYPT_LOG_N;
}

/**
 * Constant-ish work for unknown accounts.
 *
 * Login must take roughly the same time whether or not the email exists,
 * otherwise the response time is an account-enumeration oracle.
 */
export async function burnPasswordTime(): Promise<void> {
  const { N, r, p, maxmem } = params();
  await scrypt('dummy-password-for-timing-equalisation', randomBytes(SALT_LENGTH), KEY_LENGTH, {
    N,
    r,
    p,
    maxmem,
  });
}

export {
  evaluatePasswordStrength,
  isPasswordAcceptable,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  type PasswordStrength,
} from '@/lib/auth/password-policy';
