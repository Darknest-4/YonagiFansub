import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { evaluatePasswordStrength, isPasswordAcceptable } from '@/lib/auth/password-policy';

/**
 * Password hashing and policy.
 *
 * These are the tests that matter most in the whole suite: a regression here is
 * either "nobody can log in" or "everybody's password is weak", and neither
 * shows up in a smoke test.
 */

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-42');
    await expect(verifyPassword('Correct-Horse-Battery-42', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-42');
    await expect(verifyPassword('correct-horse-battery-42', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('produces a different hash for the same password (unique salt)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('Same-Password-Twice-1'),
      hashPassword('Same-Password-Twice-1'),
    ]);

    expect(a).not.toBe(b);
    // Both must still verify: the salt is embedded, not derived from the input.
    await expect(verifyPassword('Same-Password-Twice-1', a)).resolves.toBe(true);
    await expect(verifyPassword('Same-Password-Twice-1', b)).resolves.toBe(true);
  });

  it('encodes its parameters so the cost can be raised later', async () => {
    const hash = await hashPassword('Parameterised-Hash-9');
    const [algorithm, N, r, p, salt, key] = hash.split('$');

    expect(algorithm).toBe('scrypt');
    expect(Number(N)).toBeGreaterThanOrEqual(2 ** 12);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt).toBeTruthy();
    expect(key).toBeTruthy();
  });

  it('normalises unicode so the same typed password always matches', async () => {
    // U+00E9 vs. e + U+0301 — visually identical, different bytes.
    const composed = 'Jelszó-café-2026';
    const decomposed = composed.normalize('NFD');

    expect(composed).not.toBe(decomposed);

    const hash = await hashPassword(composed);
    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it('refuses a malformed or tampered hash instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$onlyfivefields')).resolves.toBe(false);
    // A tampered N that would allocate gigabytes must be rejected, not honoured.
    await expect(verifyPassword('x', 'scrypt$999999999$8$1$c2FsdA$a2V5')).resolves.toBe(false);
  });

  it('flags hashes weaker than the current policy for rehash', async () => {
    const current = await hashPassword('Rehash-Check-77');
    expect(needsRehash(current)).toBe(false);

    const legacy = current.replace(/^scrypt\$\d+\$/, 'scrypt$4096$');
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash('bcrypt$whatever')).toBe(true);
  });
});

describe('password policy', () => {
  it('accepts a password that meets every rule', () => {
    const result = evaluatePasswordStrength('Yonagi-Fansub-2026!');
    expect(result.problems).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('names each unmet requirement', () => {
    const short = evaluatePasswordStrength('Ab1');
    expect(short.problems.some((problem) => problem.includes('10 karakter'))).toBe(true);

    const noDigit = evaluatePasswordStrength('NincsBenneSzamocska');
    expect(noDigit.problems.some((problem) => problem.includes('számot'))).toBe(true);

    const noUpper = evaluatePasswordStrength('csupa-kisbetu-123');
    expect(noUpper.problems.some((problem) => problem.includes('nagybetűt'))).toBe(true);
  });

  it('rejects common passwords outright', () => {
    expect(isPasswordAcceptable('password1')).toBe(false);
    expect(isPasswordAcceptable('yonagifansub')).toBe(false);
  });

  it('rejects a password containing the username or email local part', () => {
    expect(isPasswordAcceptable('Kaito-Kaito-2026', ['kaito'])).toBe(false);
    expect(isPasswordAcceptable('Valami-Mas-2026!', ['kaito'])).toBe(true);
  });

  it('caps the score whenever any rule is unmet', () => {
    // Long and varied, but contains the username — must not score as strong.
    const result = evaluatePasswordStrength('kaito-Very-Long-Password-9999!', ['kaito']);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
