import { describe, expect, it } from 'vitest';
import {
  FOOTER_SECTIONS,
  OVERFLOW_NAV,
  PRIMARY_NAV,
  SECONDARY_NAV,
  TAB_NAV,
  disabledNavFeatures,
  visibleNav,
} from '@/components/site/nav-config';

/**
 * Menu entries for pages a setting can switch off.
 *
 * A page that 404s while three menus still link to it is worse than a broken
 * link — it is a dead link the team put there on purpose. The filtering is one
 * function used by the header, the tab bar, the sheet, the footer and the
 * sitemap, so this is where it gets pinned.
 */

describe('disabledNavFeatures', () => {
  it('minden bekapcsolva: nincs mit elrejteni', () => {
    expect(disabledNavFeatures({ scheduleEnabled: true, changelogEnabled: true })).toEqual([]);
  });

  it('a kikapcsolt funkciók nevét adja vissza', () => {
    expect(disabledNavFeatures({ scheduleEnabled: false, changelogEnabled: true })).toEqual([
      'schedule',
    ]);
    expect(disabledNavFeatures({ scheduleEnabled: false, changelogEnabled: false })).toEqual([
      'schedule',
      'changelog',
    ]);
  });

  it('a hiányzó kulcs nem jelent kikapcsolást', () => {
    // Egy „nem tudom” nem rejthet el oldalt: ilyenkor az alapértelmezés érvényes,
    // ami mindkettőnél a bekapcsolt állapot.
    expect(disabledNavFeatures({})).toEqual([]);
  });
});

describe('visibleNav', () => {
  it('a megjelölt bejegyzést kiveszi', () => {
    const off = disabledNavFeatures({ scheduleEnabled: false });
    const hrefs = visibleNav(PRIMARY_NAV, off).map((item) => item.href);

    expect(hrefs).not.toContain('/naptar');
    expect(hrefs).toContain('/projektek');
  });

  it('funkció nélküli bejegyzést soha nem rejt el', () => {
    const all = visibleNav(PRIMARY_NAV, ['schedule', 'changelog']);
    for (const item of all) expect(item.feature).toBeUndefined();
    expect(all.length).toBeGreaterThan(0);
  });

  it('üres listánál ugyanazt a tömböt adja vissza', () => {
    // Nem másolat: a szűrés a leggyakoribb esetben (minden bekapcsolva) ne
    // csináljon új tömböt minden egyes rendereléskor.
    expect(visibleNav(PRIMARY_NAV, [])).toBe(PRIMARY_NAV);
  });

  it('mind az öt felület ugyanazt rejti el', () => {
    const off = disabledNavFeatures({ scheduleEnabled: false, changelogEnabled: false });

    const surfaces = [
      visibleNav(PRIMARY_NAV, off),
      visibleNav(TAB_NAV, off),
      visibleNav(OVERFLOW_NAV, off),
      visibleNav(SECONDARY_NAV, off),
      ...FOOTER_SECTIONS.map((section) => visibleNav(section.items, off)),
    ];

    for (const items of surfaces) {
      const hrefs = items.map((item) => item.href);
      expect(hrefs).not.toContain('/naptar');
      expect(hrefs).not.toContain('/fejlesztes');
    }
  });
});

describe('a navigációs modell', () => {
  it('a tab sáv legfeljebb hat elem — a mért plafon', () => {
    // Hetediknél a legkisebb telefonon 44 képpont alá esnének a célpontok.
    expect(TAB_NAV.length).toBeLessThanOrEqual(6);
  });

  it('ami nem fér a tab sávba, az a „Több” lapon van', () => {
    const overflow = new Set(OVERFLOW_NAV.map((item) => item.href));

    for (const item of PRIMARY_NAV) {
      if (!item.tab) expect(overflow).toContain(item.href);
    }
    for (const item of SECONDARY_NAV) {
      expect(overflow).toContain(item.href);
    }
  });

  it('a „Több” lap nem ismétli meg a tab sávot', () => {
    const tabs = new Set(TAB_NAV.map((item) => item.href));
    for (const item of OVERFLOW_NAV) expect(tabs.has(item.href)).toBe(false);
  });
});
