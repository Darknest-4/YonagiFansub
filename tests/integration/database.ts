import { execFileSync } from 'node:child_process';
import type { PrismaClient } from '@prisma/client';

/**
 * The integration suite's database, and the guard rails around it.
 *
 * ## Why a separate variable, not `DATABASE_URL`
 *
 * Everything in this suite runs against a real Postgres and truncates it
 * between test files. That is only safe if pointing it at a live database is
 * *impossible* rather than merely discouraged, so it reads `TEST_DATABASE_URL`
 * and never falls back: an unset variable skips the suite instead of quietly
 * reaching for the one connection string that is definitely not a test
 * database.
 *
 * The name check on top of that is belt and braces. A developer who copies
 * their dev URL into `TEST_DATABASE_URL` gets a refusal naming the rule, which
 * is a much better afternoon than a silently emptied dev database.
 */

const NAME_PATTERN = /(^|[_-])test($|[_-])|_test$|^test/i;

export interface TestDatabase {
  url: string;
  name: string;
}

/**
 * Resolves the test database, or explains why there isn't one.
 *
 * Returns a reason rather than throwing so the suite can *skip* on a machine
 * that never configured one — a contributor running `npm test` should not see
 * failures for infrastructure they were never asked to set up — while a
 * misconfigured one still fails loudly.
 */
export function resolveTestDatabase(): { ok: true; db: TestDatabase } | { ok: false; reason: string } {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    return {
      ok: false,
      reason:
        'TEST_DATABASE_URL nincs beállítva — az integrációs tesztek kimaradnak. ' +
        'Példa: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/yonagi_test',
    };
  }

  let name: string;
  try {
    name = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error('A TEST_DATABASE_URL nem érvényes URL.');
  }

  if (!name) {
    throw new Error('A TEST_DATABASE_URL nem tartalmaz adatbázisnevet.');
  }

  // Deliberately a hard error, not a skip: the variable *is* set, so somebody
  // meant to run this. Refusing loudly is the only useful answer.
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `A(z) "${name}" adatbázisnév nem tartalmazza a "test" szót. Az integrációs tesztek ` +
        'ürítik a táblákat, ezért csak kifejezetten teszt célú adatbázison futnak. ' +
        'Nevezd át (pl. yonagi_test), vagy hozz létre egy másikat.',
    );
  }

  return { ok: true, db: { url, name } };
}

/**
 * Brings the schema up to date once per run.
 *
 * `migrate deploy` and then `db:sql`, which is exactly the deploy sequence —
 * the point of an integration suite is to exercise the schema the site actually
 * ships, including the parts Prisma cannot express. Without the second step the
 * full-text tests would silently test the tier-1 fallback.
 */
export function prepareSchema(db: TestDatabase): void {
  const env = { ...process.env, DATABASE_URL: db.url, DIRECT_DATABASE_URL: db.url };
  const run = (command: string, args: string[]) =>
    execFileSync(command, args, { env, stdio: 'pipe', encoding: 'utf8' });

  run('npx', ['prisma', 'migrate', 'deploy']);
  run('npx', ['tsx', 'scripts/apply-sql.ts']);
}

/**
 * Empties every table in one statement.
 *
 * Enumerated from `information_schema` rather than a hand-kept list, because a
 * hand-kept list goes stale the first time somebody adds a model and the next
 * test failure is a mystifying unique-constraint violation. `_prisma_migrations`
 * is excluded — truncating it would undo `prepareSchema` and make the next file
 * re-run every migration.
 *
 * `RESTART IDENTITY CASCADE` in a single statement so foreign keys never have to
 * be disabled, and ordering never has to be worked out.
 */
export async function truncateAll(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
