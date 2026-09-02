import type { z } from 'zod';
import type { roleWriteSchema, userUpdateSchema } from '@/lib/validation/schemas';

/**
 * Input types for the admin services.
 *
 * Kept in their own module so that `server/admin/*` never imports from
 * `lib/validation/schemas` at runtime — the services take plain data and stay
 * independent of how it was validated, which is what makes them callable from a
 * seed script or a maintenance job as well as from a route handler.
 */

export type UserWriteInput = z.infer<typeof userUpdateSchema>;
export type RoleWriteInput = z.infer<typeof roleWriteSchema>;
