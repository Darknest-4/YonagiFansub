import { prepareSchema, resolveTestDatabase } from './database';

/**
 * Runs once for the whole integration run, before any test file.
 *
 * Migrating here rather than in a per-file hook is what keeps the suite honest
 * about cost: `migrate deploy` on a fresh database takes seconds, and paying it
 * per file would push people towards fewer, larger test files for the wrong
 * reason.
 */
export default async function setup(): Promise<void> {
  const resolved = resolveTestDatabase();

  // The config already excluded every file in this case; this is only reachable
  // if someone points vitest at this setup directly.
  if (!resolved.ok) throw new Error(resolved.reason);

  prepareSchema(resolved.db);
}
