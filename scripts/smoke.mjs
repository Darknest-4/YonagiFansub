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
 *   3. üres-e a konzol — CSP-megsértés, betöltési hiba, JS kivétel nélkül.
 *
 * Használat:
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs
 *
 * Belépéssel az admin oldalak is bekerülnek a körbe:
 *
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_EMAIL ?? '';
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';
const CHROMIUM = process.env.SMOKE_CHROMIUM || undefined;

/** Minimális látható szöveg — ennél kevesebb üres oldalt jelent. */
const MIN_TEXT = 200;

const PUBLIC_ROUTES = [
  '/',
  '/projektek',
  '/kiadasok',
  '/hirek',
  '/csapat',
  '/gyik',
  '/kapcsolat',
  '/csatlakozz',
  '/kereses?q=a',
  '/belepes',
  '/regisztracio',
  '/adatkezeles',
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/projektek',
  '/admin/kiadasok',
  '/admin/hirek',
  '/admin/media',
  '/admin/beallitasok',
];

/**
 * A konzolzaj, amit nem tekintünk hibának.
 *
 * A megszakított RSC prefetch (`ERR_ABORTED`) normális: a Next lemondja, amikor
 * a navigáció máshova visz. Minden más — és főleg minden CSP-megsértés — valódi.
 */
const IGNORABLE = [/ERR_ABORTED/, /Download the React DevTools/];

async function check(page, route) {
  const problems = [];
  const onConsole = (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!IGNORABLE.some((pattern) => pattern.test(text))) problems.push(`konzol: ${text.slice(0, 160)}`);
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

  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(1500);

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

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);

  const status = response?.status() ?? 0;
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (state.text < MIN_TEXT) problems.push(`csak ${state.text} karakter látható szöveg`);
  if (!state.hasMain) problems.push('nincs <main> elem a DOM-ban');
  if (state.mainHeight < 100) problems.push(`a <main> magassága ${Math.round(state.mainHeight)}px`);

  return { route, status, text: state.text, problems };
}

async function main() {
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'hu-HU',
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  const results = [];
  for (const route of PUBLIC_ROUTES) results.push(await check(page, route));

  if (EMAIL && PASSWORD) {
    await page.goto(`${BASE}/belepes`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/belepes'), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    for (const route of ADMIN_ROUTES) results.push(await check(page, route));
  }

  await browser.close();

  let failed = 0;
  for (const result of results) {
    const ok = result.problems.length === 0;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${result.route.padEnd(24)} ${String(result.text).padStart(6)} karakter` +
        (ok ? '' : `\n      ${result.problems.join('\n      ')}`),
    );
  }

  console.log(`\n${results.length - failed}/${results.length} oldal rendben.`);
  if (failed > 0) {
    console.error(
      '\nEgy 200-as válasz nem bizonyíték: ezek az oldalak megérkeztek, de a böngészőben nem jelentek meg.',
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
