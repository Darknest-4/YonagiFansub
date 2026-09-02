import { describe, expect, it } from 'vitest';
// @ts-expect-error – sima .mjs segédeszköz, típusdefiníció nélkül
import { failedMigrationName, redact, withLockTimeout } from '../scripts/db-migrate.mjs';

/**
 * A deploy migrációs lépésének tiszta részei.
 *
 * Ez a három függvény azért van tesztelve, mert mindegyik némán tud elromlani.
 * Ha a `lock_timeout` lemarad az URL-ről, a deploy nem hibázik — csak megint
 * beragad tizenöt percre. Ha a hibanév-felismerés nem illeszkedik, a félbehagyott
 * migráció örökre blokkolja a következőt. Ha a redakció hibázik, egy adatbázis-
 * jelszó kerül a deploy naplójába.
 */

describe('lock_timeout beszúrása', () => {
  it('paraméter nélküli URL-hez hozzáteszi', () => {
    const result = withLockTimeout('postgresql://u:p@host:5432/db', 10_000);
    expect(new URL(result).searchParams.get('options')).toBe('-c lock_timeout=10000');
  });

  it('meglévő paramétereket megtart', () => {
    const result = withLockTimeout('postgresql://u:p@host:5432/db?schema=public', 5000);
    const params = new URL(result).searchParams;
    expect(params.get('schema')).toBe('public');
    expect(params.get('options')).toBe('-c lock_timeout=5000');
  });

  /*
    A legfontosabb eset. Egy meglévő `options` állhat olyan beállítást, ami
    nélkül a kapcsolat fel sem épül (mondjuk `search_path`); felülírni azt
    annyi lenne, mint elrontani a kapcsolatot a hiba elkerülése közben.
  */
  it('meglévő options mellé fűz, nem fölé ír', () => {
    const result = withLockTimeout(
      'postgresql://u:p@host:5432/db?options=-c%20search_path%3Dapp',
      7000,
    );
    expect(new URL(result).searchParams.get('options')).toBe(
      '-c search_path=app -c lock_timeout=7000',
    );
  });

  it('a jelszót és a hosztot érintetlenül hagyja', () => {
    const result = new URL(withLockTimeout('postgresql://u:titk%40s@host:5432/db', 1000));
    expect(result.username).toBe('u');
    expect(result.password).toBe('titk%40s');
    expect(result.host).toBe('host:5432');
    expect(result.pathname).toBe('/db');
  });
});

describe('a félbehagyott migráció felismerése', () => {
  it('kiolvassa a nevet a Prisma P3009 üzenetéből', () => {
    const output = [
      'Error: P3009',
      'migrate found failed migrations in the target database, new migrations will not be applied.',
      'The `20260902010000_drop_releases` migration started at 2026-09-02 20:12:26.210169 UTC failed',
    ].join('\n');
    expect(failedMigrationName(output)).toBe('20260902010000_drop_releases');
  });

  it('sikeres kimenetre null', () => {
    expect(failedMigrationName('No pending migrations to apply.')).toBeNull();
  });

  /*
    Zárütközésnél a Prisma P3018-at ad, nem P3009-et: az adott futás bukott el,
    nem egy korábbi. Ilyenkor újrapróbálni kell, nem takarítani — ha ezt
    összekevernénk, a szkript egy még be sem fejezett migrációt jelölne
    visszavontnak.
  */
  it('a zárütközés hibaüzenetét nem nézi félbehagyott migrációnak', () => {
    const output = [
      'Error: P3018',
      'A migration failed to apply.',
      'Migration name: 20260902010000_drop_releases',
      'Database error code: 55P03',
      'ERROR: canceling statement due to lock timeout',
    ].join('\n');
    expect(failedMigrationName(output)).toBeNull();
  });
});

/*
  A redakció engedélyezőlistás: csak a nem titkos részeket rakja össze.

  A fordítottja — az egész értéket visszaadni a jelszómező kicsillagozásával —
  addig működik, amíg az érték pontosan olyan alakú, amilyennek gondoljuk. Az
  alábbi utolsó két eset épp ezt méri: mindkettő érvényes URL a `new URL()`
  szemében, jelszómező nélkül, tehát a maszkolós változat szó szerint kiírta
  volna őket a deploy naplójába.
*/
describe('a jelszó redakciója', () => {
  it('a jelszót csillagozza, a többit meghagyja', () => {
    expect(redact('postgresql://yonagi:sup3rtitk0s@db.example:5432/yonagi')).toBe(
      'postgresql://yonagi:***@db.example:5432/yonagi',
    );
  });

  it('jelszó nélküli URL-nél is csak a biztos részeket írja ki', () => {
    expect(redact('postgresql://db.example:5432/yonagi')).toBe(
      'postgresql://db.example:5432/yonagi',
    );
  });

  it('a lekérdezési paramétereket elhagyja — ott is állhat titok', () => {
    const result = redact('postgresql://u:p@db.example:5432/yonagi?sslcert=/kulcs&x=1');
    expect(result).toBe('postgresql://u:***@db.example:5432/yonagi');
  });

  it('értelmezhetetlen értéknél sem szivárogtat', () => {
    const result = redact('nem-egy-url:titkos');
    expect(result).not.toContain('titkos');
  });

  it('URL-nek látszó, de hoszt nélküli értékből sem szivárogtat', () => {
    const result = redact('valami:jelszo@nincs-sema');
    expect(result).not.toContain('jelszo');
  });
});
