/**
 * Applies `prisma/sql/*.sql` in filename order.
 *
 * Prisma's schema language cannot express trigram indexes, partial indexes,
 * `unaccent`, or CHECK constraints, so those live in plain SQL next to the
 * schema. `docker-compose` mounts the directory into the Postgres init hook, but
 * a managed database (Neon, RDS, Supabase) has no init hook — and `psql` is not
 * installed on every deploy runner. This makes the step a single command that
 * works everywhere Node does:
 *
 *     npm run db:sql
 *
 * Every statement in those files is written to be idempotent (`IF NOT EXISTS`,
 * `DROP … IF EXISTS` before `ADD`), so re-running is safe and is in fact the
 * expected thing after a `prisma migrate deploy`.
 *
 * Connects through DIRECT_DATABASE_URL when set: DDL must not go through a
 * transaction pooler.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

// Resolved from the working directory rather than `import.meta.url`: `tsx`
// transpiles this to CommonJS, where `import.meta` does not exist. npm runs a
// script from the package root, which is exactly the anchor we want.
const SQL_DIR = path.resolve(process.cwd(), 'prisma', 'sql');

/**
 * Splits a file into statements on semicolons that are not inside a string
 * literal, a dollar-quoted block, or a comment.
 *
 * `$queryRawUnsafe` sends one statement per round trip, so the file has to be
 * split — and a naive `split(';')` would tear apart a `$$ … $$` function body or
 * a semicolon inside a comment. This is deliberately a lexer rather than a
 * regex: the failure mode of getting it wrong is a half-applied constraint file.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index] as string;
    const rest = sql.slice(index);

    // Line comment: consume to end of line.
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', index);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Block comment: consume to the closing marker.
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Single-quoted literal, with '' as the escape for a quote.
    if (char === "'") {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'" && sql[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (sql[cursor] === "'") break;
        cursor += 1;
      }
      current += sql.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }

    // Double-quoted identifier — our column names are quoted, so this matters.
    if (char === '"') {
      const end = sql.indexOf('"', index + 1);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Dollar-quoted block: $$ … $$ or $tag$ … $tag$.
    const dollarTag = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollarTag) {
      const tag = dollarTag[0];
      const end = sql.indexOf(tag, index + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    if (char === ';') {
      statements.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  statements.push(current);

  // Drop anything that is only whitespace and comments — those are not
  // statements, and Postgres rejects an empty query string.
  return statements
    .map((statement) => statement.trim())
    .filter((statement) => statement.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
}

async function main(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    console.error('DIRECT_DATABASE_URL vagy DATABASE_URL szükséges.');
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ datasources: { db: { url } } });

  const files = (await readdir(SQL_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (files.length === 0) {
    console.warn(`Nincs .sql fájl itt: ${SQL_DIR}`);
    await db.$disconnect();
    return;
  }

  console.log(`SQL alkalmazása (${files.length} fájl) → ${redact(url)}\n`);

  try {
    for (const file of files) {
      const contents = await readFile(path.join(SQL_DIR, file), 'utf8');
      const statements = splitStatements(contents);

      process.stdout.write(`  ${file} — ${statements.length} utasítás … `);

      // Not wrapped in a transaction on purpose: `CREATE INDEX CONCURRENTLY`
      // cannot run inside one, and a partially applied idempotent file is
      // repaired by simply running the command again.
      for (const statement of statements) {
        try {
          await db.$executeRawUnsafe(statement);
        } catch (error) {
          console.log('hiba');
          console.error(`\n  ✗ ${file}\n${indent(statement)}\n\n  ${String(error)}\n`);
          throw error;
        }
      }

      console.log('kész');
    }

    console.log('\n✓ Minden SQL fájl alkalmazva.');
  } finally {
    await db.$disconnect();
  }
}

/** Keeps the password out of the console and out of CI logs. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(érvénytelen URL)';
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
