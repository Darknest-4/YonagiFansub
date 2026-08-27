import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Opaque token helpers.
 *
 * Session cookies, password-reset links and verification links all follow the
 * same rule: generate 256 bits of entropy, hand the raw value to the user once,
 * and persist only its SHA-256 digest. A database dump therefore contains no
 * replayable credential.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Pseudonymised IP.
 *
 * Rate limiting and abuse investigation need to distinguish clients; they do not
 * need the address itself. HMAC with the server secret makes the value useless
 * outside this deployment and non-reversible by rainbow table.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', env.AUTH_SECRET).update(ip).digest('hex').slice(0, 32);
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is only trustworthy behind a proxy that overwrites it. The
 * deployment guide requires exactly that; `x-real-ip` covers nginx defaults.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? null;
}

/** Stateless CSRF token: `<random>.<hmac>` — verifiable without storage. */
export function issueCsrfToken(): string {
  const nonce = randomBytes(16).toString('base64url');
  const signature = createHmac('sha256', env.AUTH_SECRET).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature) return false;
  const expected = createHmac('sha256', env.AUTH_SECRET).update(nonce).digest('base64url');
  return safeCompare(signature, expected);
}
