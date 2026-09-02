/**
 * Password policy — deliberately isolated from `password.ts` (which is
 * server-only) so the exact same rules can drive the live strength meter in the
 * browser and the authoritative check on the server. One source of truth means
 * the UI can never promise a password the API will reject.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  problems: string[];
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'jelszo123',
  'jelszó123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwertz123',
  'asdfghjk',
  'admin123',
  'administrator',
  'yonagifansub',
  'yonagi123',
  'anime1234',
  'letmein123',
  'iloveyou1',
]);

export const STRENGTH_LABELS = ['Nagyon gyenge', 'Gyenge', 'Megfelelő', 'Erős', 'Kiváló'] as const;

export function evaluatePasswordStrength(
  password: string,
  context: string[] = [],
): PasswordStrength {
  const problems: string[] = [];
  const lower = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Legyen legalább ${PASSWORD_MIN_LENGTH} karakter hosszú.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Legfeljebb ${PASSWORD_MAX_LENGTH} karakter lehet.`);
  }
  if (!/[a-záéíóöőúüű]/.test(lower)) problems.push('Tartalmazzon kisbetűt.');
  if (!/[A-ZÁÉÍÓÖŐÚÜŰ]/.test(password)) problems.push('Tartalmazzon nagybetűt.');
  if (!/\d/.test(password)) problems.push('Tartalmazzon számot.');
  if (COMMON_PASSWORDS.has(lower)) problems.push('Ez a jelszó túl gyakori, könnyen kitalálható.');
  if (password.length > 0 && /^(.)\1+$/.test(password)) {
    problems.push('Ne ismételd ugyanazt a karaktert.');
  }
  if (context.some((item) => item.length >= 4 && lower.includes(item.toLowerCase()))) {
    problems.push('Ne tartalmazza a felhasználóneved vagy az e-mail-címed.');
  }

  const variety =
    Number(/[a-záéíóöőúüű]/.test(lower)) +
    Number(/[A-ZÁÉÍÓÖŐÚÜŰ]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(password));

  let score = 0;
  if (password.length >= 10 && variety >= 2) score = 1;
  if (password.length >= 12 && variety >= 3) score = 2;
  if (password.length >= 14 && variety >= 3) score = 3;
  if (password.length >= 16 && variety >= 4) score = 4;
  if (problems.length > 0) score = Math.min(score, 1);

  return {
    score: score as PasswordStrength['score'],
    label: STRENGTH_LABELS[score] ?? STRENGTH_LABELS[0],
    problems,
  };
}

/** The gate used by the API: a password must have no policy problems. */
export function isPasswordAcceptable(password: string, context: string[] = []): boolean {
  return evaluatePasswordStrength(password, context).problems.length === 0;
}
