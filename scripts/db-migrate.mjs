/**
 * A séma migrálása úgy, hogy ne tudjon némán elakadni.
 *
 * ## Miért nem elég a `prisma migrate deploy`
 *
 * Egy gördülő deploynál a régi példány addig szolgál ki, amíg az új nem áll
 * fel. Ha az új első dolga egy `ALTER TABLE` vagy `DROP TABLE`, akkor
 * ACCESS EXCLUSIVE zárra vár — a régi példány pedig épp olvassa ugyanazt a
 * táblát. A Prisma alapból **nem állít `lock_timeout`-ot**, tehát a várakozás
 * végtelen, és holtpont keletkezik: a régi példány nem áll le, amíg az új nem
 * lesz egészséges, az új pedig nem lesz egészséges, amíg a régi le nem áll.
 *
 * Ráadásul a Node kimenete csővezetéken pufferelt: a beragadt folyamat semmit
 * nem ír ki. A deploy naplója így annyit mutat, hogy „séma migrálása…”, aztán
 * tizenöt perc néma csend, végül időtúllépés. Ez a szkript pontosan ezt a két
 * bajt orvosolja.
 *
 * ## Amit csinál
 *
 *   1. `lock_timeout` a kapcsolatra: a beragadt DDL másodpercek alatt hibázik,
 *      nem vár örökké.
 *   2. Ha egy korábbi futás félbeszakadt, a Prisma `P3009`-cel elutasít minden
 *      további migrációt. Ilyenkor a félbehagyott migrációt visszavontnak
 *      jelöljük, és újrapróbáljuk — ez azért biztonságos, mert a Prisma minden
 *      migrációt tranzakcióban futtat (egyik migrációs fájlunk sem tartalmaz
 *      `CONCURRENTLY`-t), tehát a félbeszakadt futás nem hagyott maga után
 *      félkész sémát.
 *   3. Zárütközésnél újrapróbál, növekvő várakozással: a régi példány rövid
 *      lekérdezései közben nyílik rés.
 *   4. Ha végleg nem megy, **kiírja, ki fogja a zárat** — melyik folyamat,
 *      mióta, milyen lekérdezéssel —, és nem üres kézzel száll el.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LOCK_TIMEOUT_MS = Number(process.env.MIGRATE_LOCK_TIMEOUT_MS ?? 10_000);
const ATTEMPTS = Number(process.env.MIGRATE_ATTEMPTS ?? 5);
/** Növekvő várakozás a próbálkozások között, másodpercben. */
const BACKOFF = [3, 8, 20, 45];

/**
 * A kapcsolat megnevezése úgy, hogy jelszó ne kerüljön naplóba.
 *
 * Engedélyezőlistával, nem kimaszkolással: csak azokat a részeket rakjuk össze,
 * amikről tudjuk, hogy nem titkosak. A fordítottja — „vedd az egészet, és
 * csillagozd ki a jelszómezőt” — pontosan addig működik, amíg az érték olyan
 * alakú, amilyennek gondoljuk. A `nem-egy-url:titkos` például érvényes URL a
 * `new URL()` szemében, csak épp nincs benne jelszómező, amit ki lehetne
 * csillagozni — így szó szerint kikerülne a deploy naplójába.
 */
export function redact(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '(értelmezhetetlen DATABASE_URL)';
  }

  // Egy adatbázis-URL-nek van hosztja. Ha nincs, nem tudjuk, mit tartunk a
  // kezünkben — akkor inkább semmit nem írunk ki belőle.
  if (!parsed.hostname) return '(felismerhetetlen alakú DATABASE_URL)';

  const user = parsed.username ? `${parsed.username}:***@` : '';
  const port = parsed.port ? `:${parsed.port}` : '';
  const database = parsed.pathname.replace(/^\//, '') || '(nincs adatbázisnév)';

  return `${parsed.protocol}//${user}${parsed.hostname}${port}/${database}`;
}

/**
 * `lock_timeout` beszúrása a kapcsolati URL-be.
 *
 * A Postgres `options` indulási paramétere a Prisma URL-en át is átmegy. Ha már
 * van `options`, hozzáfűzünk, nem felülírunk: ott állhat olyan beállítás, ami
 * nélkül a kapcsolat nem is jó.
 */
export function withLockTimeout(url, lockTimeoutMs = LOCK_TIMEOUT_MS) {
  const parsed = new URL(url);
  const existing = parsed.searchParams.get('options');
  const setting = `-c lock_timeout=${lockTimeoutMs}`;
  parsed.searchParams.set('options', existing ? `${existing} ${setting}` : setting);
  return parsed.toString();
}

function runMigrate(env) {
  return spawnSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env,
    encoding: 'utf8',
    // A kimenetet magunk írjuk ki: így akkor is látszik, ha a gyermekfolyamat
    // pufferelten dolgozna.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Ki fogja a zárat.
 *
 * Külön kapcsolaton kérdezzük, mert a migrációt egy másik folyamat futtatja, és
 * az épp vár — a saját pid-jét innen nem ismerjük, tehát a `pg_blocking_pids`
 * nem hívható rá. Helyette az összes folyamatot kiírjuk a tranzakciójuk korával
 * együtt: a hosszú ideje nyitott tranzakció önmagát árulja el, és ez az, amit
 * egy deploy közben tudni kell.
 */
async function reportBlockers(url) {
  // Késleltetett behozatal: a `@prisma/client` betöltése mellékhatásként `.env`
  // fájlokat is beolvas, és a környezet olvasása nem függhet attól, hogy ez a
  // diagnosztikai függvény létezik-e. A konfigurációt fentebb, kimondottan
  // töltjük be.
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await db.$queryRawUnsafe(`
      SELECT pid,
             state,
             (now() - xact_start)::text AS tranzakcio_kora,
             (now() - state_change)::text AS allapot_kora,
             left(regexp_replace(query, '\\s+', ' ', 'g'), 120) AS lekerdezes
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state IS NOT NULL
      ORDER BY xact_start NULLS LAST
      LIMIT 20
    `);

    if (rows.length === 0) {
      console.error('  A kapcsolódó folyamatok listája üres — a zárat nem ez az adatbázis fogja.');
      return;
    }

    console.error('  Az adatbázison jelenleg futó folyamatok:\n');
    for (const row of rows) {
      console.error(
        `    pid ${row.pid}  [${row.state}]  tranzakció: ${row.tranzakcio_kora ?? '—'}\n` +
          `      ${row.lekerdezes}`,
      );
    }
    console.error(
      '\n  Ha van köztük „idle in transaction” állapotú, az a hibás: egy nyitva\n' +
        '  felejtett tranzakció minden sémamódosítást megállít.',
    );
  } catch (error) {
    console.error(`  A folyamatlista lekérdezése sem sikerült: ${String(error)}`);
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

/** A `P3009` hibaüzenetből kiolvassa, melyik migráció maradt félbe. */
export function failedMigrationName(output) {
  return /The `([^`]+)` migration started at .* failed/.exec(output)?.[1] ?? null;
}

function markRolledBack(name, env) {
  console.error(`  A(z) ${name} migráció félbehagyottként áll az adatbázisban.`);
  console.error('  Visszavontnak jelöljük, hogy újra megkísérelhető legyen.');

  const result = spawnSync(
    'node_modules/.bin/prisma',
    ['migrate', 'resolve', '--rolled-back', name],
    { env, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(result.stdout ?? '');
    console.error(result.stderr ?? '');
    return false;
  }
  console.error('  Rendben — a következő próbálkozás újra lefuttatja.\n');
  return true;
}

/**
 * A konfiguráció betöltése, kimondottan.
 *
 * Konténerben a platform valódi környezeti változókat ad, tehát nincs mit
 * tenni. Fejlesztéskor viszont a `.env`-ben állnak, és a Prisma CLI magától
 * beolvassa őket — ez a szkript pedig nem futhat máshogy, mint a parancs, amit
 * helyettesít. A `loadEnvFile` nem ír felül semmit, ami már be van állítva:
 * a környezet erősebb, mint a fájl.
 */
function loadEnvFiles() {
  if (process.env.DATABASE_URL) return;
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Nincs ilyen fájl, vagy nem olvasható — ez a szokásos eset éles
      // környezetben, nem hiba.
    }
  }
}

async function main() {
  loadEnvFiles();

  const rawDirect = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const rawApp = process.env.DATABASE_URL;

  if (!rawDirect || !rawApp) {
    console.error('  Nincs DATABASE_URL. A migráció nem indulhat el.');
    process.exit(1);
  }

  let migrationUrl;
  try {
    migrationUrl = withLockTimeout(rawDirect);
  } catch {
    console.error(`  A DATABASE_URL nem értelmezhető URL-ként: ${redact(rawDirect)}`);
    process.exit(1);
  }

  console.log(`  Cél: ${redact(rawDirect)}`);
  console.log(`  Zárvárakozási korlát: ${LOCK_TIMEOUT_MS} ms, legfeljebb ${ATTEMPTS} próba.`);

  // A gyermekfolyamat mindkét változót a korlátozott URL-lel kapja: a séma
  // `directUrl`-t használ a migrációhoz, de a `url` is validálódik.
  const env = {
    ...process.env,
    DATABASE_URL: withLockTimeout(rawApp),
    DIRECT_DATABASE_URL: migrationUrl,
    // A Prisma CLI verzióellenőrzése kimenő HTTPS-hívás. Egy deploy alatt
    // fölösleges, korlátozott hálózaton pedig maga is várakozási forrás.
    CHECKPOINT_DISABLE: '1',
  };

  /*
    A takarítás nem számít próbálkozásnak.

    Egy zárütközés két hibában jelentkezik: az adott futás elhasal, a KÖVETKEZŐ
    pedig `P3009`-cel elutasít mindent, mert az előző félbehagyottként áll az
    adatbázisban. A takarítás tehát az újrapróbálkozás első fele, nem külön
    kísérlet — ha beleszámítana, a próbálkozások fele a saját nyomainkra menne
    el. Külön korlátja van, hogy egy magától nem oldódó helyzet se pörögjön
    végtelenségig.
  */
  let attempt = 0;
  let cleanups = 0;

  while (attempt < ATTEMPTS) {
    const result = runMigrate(env);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    process.stdout.write(output);

    if (result.status === 0) {
      console.log('  A séma naprakész.');
      return;
    }

    const failed = failedMigrationName(output);
    if (failed) {
      cleanups += 1;
      if (cleanups > ATTEMPTS || !markRolledBack(failed, env)) break;
      continue;
    }

    const lockContention = /lock timeout|55P03|deadlock detected|40P01/i.test(output);
    if (!lockContention) break;

    attempt += 1;
    if (attempt >= ATTEMPTS) break;

    const wait = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
    console.error(`\n  Zárütközés (${attempt}/${ATTEMPTS}). Újrapróbálás ${wait} másodperc múlva.`);
    if (attempt === 1) await reportBlockers(migrationUrl);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }

  console.error('\n  A migráció nem futott le.\n');
  await reportBlockers(migrationUrl);
  console.error(
    '\n  Ha ez egy gördülő deploy: a régi példány fogja a táblákat, amiket ez a\n' +
      '  migráció átalakít. Ilyenkor a szolgáltatást le kell állítani (Render:\n' +
      '  Suspend), megvárni a deployt, és utána visszakapcsolni.\n',
  );
  process.exit(1);
}

/*
  Csak közvetlen indításkor fut.

  Így a fenti tiszta függvények egységtesztből behozhatók anélkül, hogy a
  behozatal migrálni kezdene egy adatbázist.
*/
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`  Váratlan hiba a migrációs lépésben: ${String(error)}`);
    process.exit(1);
  });
}
