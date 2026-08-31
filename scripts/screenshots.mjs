/**
 * Képernyőképek a dokumentációhoz.
 *
 * A `docs/screenshots/` tartalmát ez a szkript állítja elő, hogy a képek ne
 * kézzel összegyűjtött, egymáshoz képest eltérő pillanatfelvételek legyenek:
 * azonos viewport, azonos adatbázis-állapot, azonos várakozási feltételek.
 * Ha a felület változik, a mappa egyetlen paranccsal újragenerálható.
 *
 * Használat (a szerver már fusson a megadott címen):
 *
 *   SHOT_BASE_URL=http://127.0.0.1:3900 \
 *   SHOT_EMAIL=owner@yonagifansub.hu SHOT_PASSWORD=… \
 *   node scripts/screenshots.mjs
 *
 * Az admin és a fiók oldalakhoz belépés kell; a szkript egyszer jelentkezik be,
 * és a munkamenetet minden további oldalhoz újrahasználja.
 */
import { chromium } from 'playwright';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const BASE = process.env.SHOT_BASE_URL ?? 'http://127.0.0.1:3900';
const EMAIL = process.env.SHOT_EMAIL ?? 'owner@yonagifansub.hu';
const PASSWORD = process.env.SHOT_PASSWORD ?? '';
const OUT = path.resolve(process.cwd(), 'docs/screenshots');

/** Asztali szélesség; a magasság csak a viewport, a kép teljes oldal. */
const VIEWPORT = { width: 1440, height: 900 };
/** Mobil: ugyanaz az oldal, telefonon — a reszponzív munka enélkül láthatatlan. */
const MOBILE = { width: 390, height: 844 };

const slug = (value) => String(value);

/**
 * Oldalak. A `mobile: true` jelöltekről telefonos kép is készül — azok, ahol a
 * reszponzív elrendezés érdemben más, nem csak keskenyebb.
 */
const PUBLIC_PAGES = [
  { file: '01-fooldal', path: '/', title: 'Főoldal', mobile: true },
  { file: '02-projektek', path: '/projektek', title: 'Projektek (katalógus)', mobile: true },
  { file: '03-projekt-reszletek', path: '/projektek/yoru-no-shizuku', title: 'Projekt adatlap', mobile: true },
  { file: '04-epizod', path: '/projektek/yoru-no-shizuku/1', title: 'Epizód, lejátszó és letöltések', mobile: true },
  { file: '05-kiadasok', path: '/kiadasok', title: 'Kiadások', mobile: true },
  { file: '06-hirek', path: '/hirek', title: 'Hírek' },
  { file: '07-hir', path: '/hirek/yoru-no-shizuku-bejelentes', title: 'Hír' },
  { file: '08-csapat', path: '/csapat', title: 'Csapat' },
  { file: '09-csapattag', path: '/csapat/kaito', title: 'Csapattag profil' },
  { file: '10-gyik', path: '/gyik', title: 'GYIK' },
  { file: '11-kapcsolat', path: '/kapcsolat', title: 'Kapcsolat' },
  { file: '12-csatlakozz', path: '/csatlakozz', title: 'Csatlakozz' },
  { file: '13-kereses', path: '/kereses?q=yoru', title: 'Keresés' },
  { file: '14-belepes', path: '/belepes', title: 'Belépés' },
  { file: '15-regisztracio', path: '/regisztracio', title: 'Regisztráció' },
  { file: '16-jelszo-visszaallitas', path: '/jelszo-visszaallitas', title: 'Elfelejtett jelszó' },
  { file: '17-adatkezeles', path: '/adatkezeles', title: 'Adatkezelési tájékoztató' },
  { file: '18-felhasznalasi-feltetelek', path: '/felhasznalasi-feltetelek', title: 'Felhasználási feltételek' },
  { file: '19-dmca', path: '/dmca', title: 'Jogtulajdonosi megkeresés' },
  { file: '20-404', path: '/nincs-ilyen-oldal', title: '404 – nem található' },
  { file: '21-karbantartas', path: '/karbantartas', title: 'Karbantartási mód' },
];

const ACCOUNT_PAGES = [
  { file: '30-profil', path: '/profil', title: 'Profil' },
  { file: '31-profil-beallitasok', path: '/profil/beallitasok', title: 'Fiókbeállítások' },
  { file: '32-profil-ertesitesek', path: '/profil/ertesitesek', title: 'Értesítések' },
  { file: '33-profil-kedvencek', path: '/profil/kedvencek', title: 'Követett projektek' },
];

const ADMIN_PAGES = (ids) => [
  { file: '40-admin-vezerlopult', path: '/admin', title: 'Vezérlőpult', mobile: true },
  { file: '41-admin-statisztika', path: '/admin/statisztika', title: 'Statisztika' },
  { file: '42-admin-projektek', path: '/admin/projektek', title: 'Projektek' },
  { file: '43-admin-projekt-szerkeszto', path: `/admin/projektek/${ids.projectId}`, title: 'Projekt szerkesztő' },
  { file: '44-admin-projekt-uj', path: '/admin/projektek/uj', title: 'Új projekt' },
  {
    file: '44b-admin-metaadat-import',
    path: '/admin/projektek/import',
    title: 'Metaadat-import (AniList + Jikan)',
  },
  { file: '45-admin-kiadasok', path: '/admin/kiadasok', title: 'Kiadások' },
  { file: '46-admin-kiadas-uj', path: '/admin/kiadasok/uj', title: 'Új kiadás' },
  { file: '47-admin-hirek', path: '/admin/hirek', title: 'Hírek' },
  { file: '48-admin-hir-szerkeszto', path: `/admin/hirek/${ids.newsId}`, title: 'Hír szerkesztő' },
  { file: '49-admin-csapat', path: '/admin/csapat', title: 'Csapat', mobile: true },
  { file: '50-admin-mediatar', path: '/admin/media', title: 'Médiatár' },
  { file: '51-admin-gyik', path: '/admin/gyik', title: 'GYIK kezelés' },
  { file: '52-admin-uzenetek', path: '/admin/uzenetek', title: 'Kapcsolati üzenetek' },
  { file: '53-admin-hozzaszolasok', path: '/admin/hozzaszolasok', title: 'Hozzászólás-moderálás' },
  { file: '54-admin-felhasznalok', path: '/admin/felhasznalok', title: 'Felhasználók', mobile: true },
  { file: '55-admin-szerepkorok', path: '/admin/szerepkorok', title: 'Szerepkörök és jogosultságok' },
  { file: '56-admin-beallitasok', path: '/admin/beallitasok', title: 'Beállítások' },
  { file: '57-admin-naplo', path: '/admin/naplo', title: 'Audit napló' },
  {
    file: '58-admin-videoszolgaltatok',
    path: '/admin/videoszolgaltatok',
    title: 'Videószolgáltatók',
  },
];

/**
 * Egy oldal lefényképezése.
 *
 * `networkidle` helyett explicit feltételekre várunk: a `networkidle` egy
 * streamelő RSC oldalon vagy túl korán sül el, vagy sosem. A képek betöltésére
 * külön várunk, mert egy félig betöltött borító pont azt teszi tönkre, amiért a
 * kép készül. Az animációkat a `reducedMotion` állítja le, így két futás
 * ugyanazt a képet adja.
 */
async function shoot(page, url, file, { fullPage = true } = {}) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  await page.waitForLoadState('load').catch(() => {});
  // A Suspense-határok mögötti tartalom a HTML után érkezik.
  await page.waitForTimeout(1200);

  await page
    .evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })),
      );
      if (document.fonts?.ready) await document.fonts.ready;
    })
    .catch(() => {});

  await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage, animations: 'disabled' });
  return response?.status() ?? 0;
}

async function main() {
  if (!PASSWORD) {
    console.error('SHOT_PASSWORD kötelező (az admin és a fiók oldalakhoz belépés kell).');
    process.exitCode = 1;
    return;
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  /*
   * `executablePath`: a környezetben előre telepített Chromium-építés nem
   * feltétlenül egyezik azzal, amit az éppen telepített Playwright letöltene.
   * A `SHOT_CHROMIUM` megadásával a meglévő böngésző használható letöltés
   * nélkül; enélkül a Playwright a saját példányát keresi.
   */
  const executablePath = process.env.SHOT_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    colorScheme: 'dark',
    // Determinisztikus képek: mozgás nélkül minden futás ugyanazt adja.
    reducedMotion: 'reduce',
  });

  const page = await context.newPage();
  const results = [];

  // ── Nyilvános oldalak ──────────────────────────────────────────────────────
  for (const item of PUBLIC_PAGES) {
    const status = await shoot(page, `${BASE}${item.path}`, item.file);
    results.push({ ...item, status, group: 'public' });
    console.log(`  ${String(status).padEnd(4)} ${item.file}  ${item.path}`);
  }

  // ── Belépés ────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/belepes`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/belepes'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log('  belépve mint', EMAIL);

  // ── Fiók és admin ──────────────────────────────────────────────────────────
  const ids = {
    projectId: process.env.SHOT_PROJECT_ID ?? '',
    newsId: process.env.SHOT_NEWS_ID ?? '',
  };

  const accountFiles = new Set(ACCOUNT_PAGES.map((item) => item.file));

  for (const item of [...ACCOUNT_PAGES, ...ADMIN_PAGES(ids)]) {
    const status = await shoot(page, `${BASE}${item.path}`, item.file);
    results.push({ ...item, status, group: accountFiles.has(item.file) ? 'account' : 'admin' });
    console.log(`  ${String(status).padEnd(4)} ${item.file}  ${item.path}`);
  }

  // ── Mobil változatok ───────────────────────────────────────────────────────
  const mobileContext = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    storageState: await context.storageState(),
  });
  const mobilePage = await mobileContext.newPage();

  for (const item of [...PUBLIC_PAGES, ...ADMIN_PAGES(ids)].filter((entry) => entry.mobile)) {
    const status = await shoot(mobilePage, `${BASE}${item.path}`, `${item.file}-mobil`);
    console.log(`  ${String(status).padEnd(4)} ${item.file}-mobil`);
  }

  await browser.close();

  await optimise();
  await writeIndex(results);

  const files = (await readdir(OUT)).filter((name) => name.endsWith('.png'));
  const failed = results.filter((entry) => entry.status !== 200 && !entry.file.startsWith('20-'));

  console.log(`\n${files.length} kép a docs/screenshots/ mappában.`);
  if (failed.length > 0) {
    console.error('Nem 200-as válasz:', failed.map((entry) => `${entry.path} (${entry.status})`).join(', '));
    process.exitCode = 1;
  }
}

/**
 * A mappa tartalomjegyzéke.
 *
 * A gyökér README ide hivatkozik, a szkript viszont minden futás elején törli a
 * mappát — így a hivatkozás addig törött volt, amíg a fájl kézzel írva létezett
 * volna. Ha a szkript írja, nem tud elavulni és nem tud eltűnni: ugyanabból a
 * listából készül, amiből a képek.
 */
async function writeIndex(results) {
  const mobile = new Set(
    (await readdir(OUT))
      .filter((name) => name.endsWith('-mobil.png'))
      .map((name) => name.replace(/-mobil\.png$/, '')),
  );

  const section = (title, items) =>
    [
      `## ${title}`,
      '',
      ...items.map((item) => {
        const phone = mobile.has(item.file) ? ` · [mobil](${item.file}-mobil.png)` : '';
        return `- **${item.title}** — [${item.file}.png](${item.file}.png)${phone}  \n  \`${item.path}\``;
      }),
      '',
    ].join('\n');

  const pick = (group) => results.filter((item) => item.group === group);

  const content = [
    '# Képernyőképek',
    '',
    'Ezt a mappát a `npm run screenshots` állítja elő — kézzel ne szerkeszd, mert',
    'a következő futás törli. Minden kép azonos viewportról, azonos',
    'adatbázis-állapotról és sötét témával készül, hogy a képek összehasonlíthatók',
    'legyenek. Ahol a mobil elrendezés érdemben más, arról telefonos kép is van.',
    '',
    `Legutóbbi futás: ${results.length} oldal.`,
    '',
    section('Nyilvános oldalak', pick('public')),
    section('Fiók', pick('account')),
    section('Admin', pick('admin')),
  ].join('\n');

  await writeFile(path.join(OUT, 'README.md'), `${content}\n`, 'utf8');
}

/**
 * PNG-tömörítés paletta-kvantálással.
 *
 * A nyers Playwright-kimenet 24 bites truecolor, ami egy sötét, néhány színből
 * álló felülethez pazarlás: a mappa így 16 MB, tömörítve 3 MB körül van. Egy
 * repóba kerülő dokumentációnál ez a különbség számít, a képen viszont nem
 * látszik — a felület palettája jóval 256 szín alatt van.
 *
 * A `sharp` a Next függősége, tehát nem hoz be új csomagot. Ha valamiért nem
 * elérhető, a tömörítés kimarad, de a képek elkészülnek — egy hiányzó
 * optimalizálás nem ok arra, hogy az egész lépés elbukjon.
 */
async function optimise() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('  (sharp nem elérhető — tömörítés kihagyva)');
    return;
  }

  const files = (await readdir(OUT)).filter((name) => name.endsWith('.png'));
  let before = 0;
  let after = 0;

  for (const name of files) {
    const file = path.join(OUT, name);
    before += (await stat(file)).size;
    const output = await sharp(file)
      .png({ palette: true, quality: 90, effort: 8 })
      .toBuffer();
    await writeFile(file, output);
    after += output.length;
  }

  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  console.log(`  tömörítve: ${mb(before)} → ${mb(after)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
