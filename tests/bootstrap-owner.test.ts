import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_KEY, OWNER_ROLE_KEY, SYSTEM_ROLES } from '@/shared/auth/permissions';

/**
 * Bootstrap: az első fiók tulajdonos lesz.
 *
 * A tényleges tranzakciót adatbázis nélkül nem lehet lefuttatni, de a döntés
 * bemenetei igenis ellenőrizhetők — és pont ezek azok, amiket egy átnevezés
 * vagy egy szerepkör-átrendezés némán elronthat. Ha a `SYSTEM_ROLES`-ből
 * eltűnik az `owner` kulcs, vagy elveszti a teljes jogosultságot, akkor az
 * első regisztráló egy üres jogosultságú fiókot kapna — a rendszert senki nem
 * tudná beállítani, és semmi nem jelezné.
 */

describe('bootstrap szerepkörök', () => {
  it('az owner és a member szerepkör is létezik a rendszerben', () => {
    const keys = SYSTEM_ROLES.map((role) => role.key);
    expect(keys).toContain(OWNER_ROLE_KEY);
    expect(keys).toContain(DEFAULT_ROLE_KEY);
  });

  it('az owner a legerősebb szerepkör (legkisebb rank)', () => {
    const owner = SYSTEM_ROLES.find((role) => role.key === OWNER_ROLE_KEY);
    expect(owner).toBeDefined();

    const ranks = SYSTEM_ROLES.map((role) => role.rank);
    expect(owner?.rank).toBe(Math.min(...ranks));
  });

  it('az owner teljes jogosultsággal rendelkezik, nem felsorolt listával', () => {
    const owner = SYSTEM_ROLES.find((role) => role.key === OWNER_ROLE_KEY);
    // A csillag az a jelölés, amit a `hasPermission` mindenre igaznak vesz.
    expect(owner?.permissions).toBe('*');
  });

  it('a member NEM kap admin hozzáférést — a második regisztráló ezt kapja', () => {
    const member = SYSTEM_ROLES.find((role) => role.key === DEFAULT_ROLE_KEY);
    expect(member?.permissions).not.toBe('*');
    expect(member?.permissions).not.toContain('admin:access');
  });

  it('a két kulcs különbözik, különben a bootstrap észrevétlenül no-op lenne', () => {
    expect(OWNER_ROLE_KEY).not.toBe(DEFAULT_ROLE_KEY);
  });
});
