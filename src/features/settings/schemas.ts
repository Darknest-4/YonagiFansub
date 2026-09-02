import { z } from 'zod';

export const settingsWriteSchema = z.object({
  values: z.record(z.string().max(64), z.unknown()),
});
