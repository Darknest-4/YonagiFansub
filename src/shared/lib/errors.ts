/**
 * Application error taxonomy.
 *
 * Every error that reaches the API boundary is one of these, or is wrapped into
 * an `InternalError`. `expose` decides whether the message is safe to send to a
 * client — internal failures never leak their message, only a request id.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    options: { expose?: boolean; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.expose = options.expose ?? status < 500;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Hibás kérés.', details?: unknown) {
    super('BAD_REQUEST', message, 400, { details });
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldErrors, message = 'A megadott adatok érvénytelenek.') {
    super('VALIDATION_FAILED', message, 422, { details: { fields } });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Bejelentkezés szükséges.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Nincs jogosultságod ehhez a művelethez.') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Az erőforrás') {
    super('NOT_FOUND', `${resource} nem található.`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Az erőforrás már létezik.', details?: unknown) {
    super('CONFLICT', message, 409, { details });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'A feltöltött tartalom túl nagy.') {
    super('PAYLOAD_TOO_LARGE', message, 413);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Nem támogatott fájltípus.') {
    super('UNSUPPORTED_MEDIA_TYPE', message, 415);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Túl sok kérés. Próbáld újra később.') {
    super('RATE_LIMITED', message, 429, { details: { retryAfterSeconds } });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalError extends AppError {
  constructor(message = 'Váratlan hiba történt.', cause?: unknown) {
    super('INTERNAL_ERROR', message, 500, { expose: false, cause });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'A szolgáltatás átmenetileg nem elérhető.') {
    super('SERVICE_UNAVAILABLE', message, 503, { expose: false });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalises anything thrown into an `AppError`, preserving known Prisma cases. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const prismaCode = (error as { code?: string }).code;
    const meta = (error as { meta?: { target?: string[] | string; modelName?: string } }).meta;

    switch (prismaCode) {
      case 'P2002': {
        const target = Array.isArray(meta?.target) ? meta.target.join(', ') : meta?.target;
        return new ConflictError(
          target
            ? `Ez az érték már foglalt: ${target}.`
            : 'Ez az érték már foglalt.',
        );
      }
      case 'P2025':
        return new NotFoundError(meta?.modelName ?? 'Az erőforrás');
      case 'P2003':
        return new ConflictError('A művelet hivatkozási megszorításba ütközik.');
      case 'P2024':
        return new ServiceUnavailableError('Az adatbázis jelenleg túlterhelt.');
      default:
        break;
    }
  }

  return new InternalError('Váratlan hiba történt.', error);
}
