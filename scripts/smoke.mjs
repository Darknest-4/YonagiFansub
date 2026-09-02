/**
 * Böngészős füstpróba.
 *
 * Ez a szkript azért létezik, mert egy `curl`-alapú ellenőrzés **nem elég**, és
 * ezt drágán tanultuk meg: a CSP-ből hiányzott a `script-src`, így a böngésző
 * minden beágyazott scriptet blokkolt. A React streamelő SSR-je viszont pont
 * ezekkel a scriptekkel emeli a helyükre a `<template>`-ekben érkező
 * tartalmakat — blokkolva a HTML hiánytalanul megérkezett (100 kB), a
 * megjelenített oldal pedig **üres maradt**. Minden útvonal 200-at adott,
 * miközben minden böngészőben fekete képernyő volt.
 *
 * Amit tehát ellenőrizni kell, az nem a státuszkód, hanem:
 *
 *   1. van-e látható szöveg (`innerText`), nem csak HTML,
 *   2. megjelent-e a fejléc és a `<main>` valós mérettel,
 *   3. üres-e a konzol — CSP-megsértés, betöltési hiba, JS kivétel nélkül,
 *   4. **akadálymentes-e** (axe-core, WCAG 2 AA),
 *   5. **nem csordul-e túl vízszintesen** telefonon és tableten.
 *
 * A 4. és 5. pont az audit után került ide. Az akadálymentességi vizsgálat
 * 115 hibás elemet talált hat szabálytípusban, és a javítás után nullát ad —
 * de ezt semmi nem őrizte: a következő stílusváltoztatás észrevétlenül
 * visszahozta volna. Egy mérés, ami nem fut le újra, nem eredmény, csak
 * pillanatkép.
 *
 * Használat:
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs
 *
 * Belépéssel az admin oldalak is bekerülnek a körbe:
 *
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke.mjs
 *
 * A kilépési kód nem nulla, ha bármelyik ellenőrzés elbukott — így CI-ban
 * blokkolni tud.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_EMAIL ?? '';
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';
const CHROMIUM = process.env.SMOKE_CHROMIUM || undefined;

/** Minimális látható szöveg — ennél kevesebb üres oldalt jelent. */
const MIN_TEXT = 200;

const PUBLIC_ROUTES = [
  '/',
  '/projektek',
  '/naptar',
  '/hirek',
  '/csapat',
  '/gyik',
  '/kapcsolat',
  '/csatlakozz',
  '/fejlesztes',
  '/kereses?q=a',
  '/belepes',
  '/regisztracio',
  '/adatkezeles',
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/projektek',
  '/admin/hirek',
  '/admin/media',
  '/admin/beallitasok',
];

/**
 * Nézetszélességek a reszponzív ellenőrzéshez.
 *
 * Nem önkényesek: 390 a legelterjedtebb telefonszélesség, 768 az a pont, ahol a
 * tablet-elrendezés bekapcsol, 1440 pedig a laptopok többsége. A vízszintes
 * túlcsordulás mindháromban mérve van, mert a legtöbb ilyen hiba pont a
 * töréspontok között bújik meg.
 */
const VIEWPORTS = [
  { name: 'mobil', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

/**
 * A konzolzaj, amit nem tekintünk hibának.
 *
 * A megszakított RSC prefetch (`ERR_ABORTED`) normális: a Next lemondja, amikor
 * a navigáció máshova visz. Minden más — és főleg minden CSP-megsértés — valódi.
 */
const IGNORABLE = [/ERR_ABORTED/, /Download the React DevTools/];

/**
 * Az axe-core forrása, a telepített csomagból.
 *
 * Beinjektálva fut a vizsgált oldalon, nem a Node oldalán: a szabályok egy
 * részének valódi elrendezés kell (kontrasztnál a ténylegesen kiszámolt
 * háttérszín, nem a CSS-ben deklarált).
 */
function loadAxe() {
  try {
    const require = createRequire(import.meta.url);
    return readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  } catch {
    return null;
  }
}

const AXE = loadAxe();

function attachListeners(page, problems) {
  const onConsole = (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!IGNORABLE.some((pattern) => pattern.test(text))) {
      problems.push(`konzol: ${text.slice(0, 160)}`);
    }
  };
  const onPageError = (error) => problems.push(`kivétel: ${String(error).slice(0, 160)}`);
  const onRequestFailed = (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (!IGNORABLE.some((pattern) => pattern.test(failure))) {
      problems.push(`kérés: ${request.url().slice(0, 100)} — ${failure}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);

  return () => {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
  };
}

/** Tartalmi ellenőrzés: megjelent-e egyáltalán az oldal. */
async function checkContent(page, route) {
  const problems = [];
  const detach = attachListeners(page, problems);

  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const main = document.querySelector('main');
    const header = document.querySelector('header');
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    return {
      text: document.body.innerText.trim().length,
      mainHeight: box(main)?.height ?? 0,
      headerHeight: box(header)?.height ?? 0,
      hasMain: Boolean(main),
    };
  });

  detach();

  const status = response?.status() ?? 0;
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (state.text < MIN_TEXT) problems.push(`csak ${state.text} karakter látható szöveg`);
  if (!state.hasMain) problems.push('nincs <main> elem a DOM-ban');
  if (state.mainHeight < 100) problems.push(`a <main> magassága ${Math.round(state.mainHeight)}px`);
  if (state.headerHeight < 24) problems.push('a fejléc nem jelent meg');

  return { route, status, text: state.text, problems };
}

/**
 * Akadálymentesség és vízszintes túlcsordulás egy adott szélességen.
 *
 * A két vizsgálat azért van egy körben, mert ugyanaz a betöltés kell hozzájuk,
 * és egy oldalbetöltés a szkript legdrágább lépése.
 */
async function checkViewport(page, route) {
  const problems = [];

  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(700);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  /*
    Egy képpont tűrés: a kerekítés törtszámú elrendezésnél néha ad egy
    képpontnyi eltérést, ami nem látszik és nem is görgethető.
  */
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    problems.push(
      `vízszintes túlcsordulás: ${overflow.scrollWidth}px tartalom ${overflow.clientWidth}px-en`,
    );
  }

  if (AXE) {
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { resultTypes: ['violations'] });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
      }));
    });

    for (const v of violations) {
      problems.push(`a11y ${v.id} (${v.impact}, ${v.nodes} elem): ${v.help}`);
    }
  }

  return problems;
}

async function main() {
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

  if (!AXE) {
    console.warn(
      '  ! Az axe-core nincs telepítve — az akadálymentességi vizsgálat kimarad.\n' +
        '    Telepítés: npm i -D axe-core\n',
    );
  }

  // ── 1. Tartalmi ellenőrzés, desktop szélességen ──────────────────────────
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'hu-HU',
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  console.log('Tartalom — megjelent-e az oldal a böngészőben\n');
  const results = [];
  for (const route of PUBLIC_ROUTES) results.push(await checkContent(page, route));

  let loggedIn = false;
  if (EMAIL && PASSWORD) {
    await page.goto(`${BASE}/belepes`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/belepes'), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    loggedIn = true;
    for (const route of ADMIN_ROUTES) results.push(await checkContent(page, route));
  }

  let failed = 0;
  for (const result of results) {
    const ok = result.problems.length === 0;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${result.route.padEnd(24)} ${String(result.text).padStart(6)} karakter` +
        (ok ? '' : `\n      ${result.problems.join('\n      ')}`),
    );
  }
  console.log(`\n  ${results.length - failed}/${results.length} oldal rendben.\n`);
  await context.close();

  // ── 2. Hírfolyam: nem HTML, saját ellenőrzés ─────────────────────────────
  const feedContext = await browser.newContext({ locale: 'hu-HU' });
  const feed = await feedContext.request.get(`${BASE}/rss`);
  const feedBody = await feed.text();
  const feedOk = feed.status() === 200 && feedBody.includes('<rss') && feedBody.includes('<item>');
  console.log(`Hírfolyam\n\n  ${feedOk ? '✓' : '✗'} /rss — HTTP ${feed.status()}, ${feedBody.length} bájt\n`);
  if (!feedOk) failed += 1;
  await feedContext.close();

  // ── 3. Reszponzivitás és akadálymentesség ────────────────────────────────
  console.log('Reszponzivitás és akadálymentesség\n');
  let viewportFailed = 0;
  let viewportChecks = 0;

  for (const vp of VIEWPORTS) {
    const vpContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      locale: 'hu-HU',
      colorScheme: 'dark',
    });
    const vpPage = await vpContext.newPage();

    const failures = [];
    for (const route of PUBLIC_ROUTES) {
      viewportChecks += 1;
      const problems = await checkViewport(vpPage, route);
      if (problems.length > 0) {
        viewportFailed += 1;
        failures.push({ route, problems });
      }
    }

    console.log(
      `  ${failures.length === 0 ? '✓' : '✗'} ${vp.name.padEnd(8)} ${vp.width}px — ` +
        `${PUBLIC_ROUTES.length - failures.length}/${PUBLIC_ROUTES.length} oldal rendben`,
    );
    for (const f of failures) {
      console.log(`      ${f.route}\n        ${f.problems.join('\n        ')}`);
    }

    await vpContext.close();
  }

  console.log(`\n  ${viewportChecks - viewportFailed}/${viewportChecks} mérés rendben.`);
  failed += viewportFailed;

  await browser.close();

  if (!loggedIn) {
    console.log(
      '\n  Az admin oldalak kimaradtak. Bevonásukhoz: SMOKE_EMAIL és SMOKE_PASSWORD.',
    );
  }

  if (failed > 0) {
    console.error(
      '\nEgy 200-as válasz nem bizonyíték: ezek az oldalak megérkeztek, de a böngészőben' +
        ' nem jelentek meg, kilógtak a képernyőről, vagy akadálymentességi hibát adtak.',
    );
    process.exitCode = 1;
  } else {
    console.log('\nMinden ellenőrzés rendben.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
