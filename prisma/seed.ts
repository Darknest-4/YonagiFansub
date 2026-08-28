/**
 * Database seed.
 *
 * Two responsibilities, deliberately kept apart:
 *
 *   1. **Reconciliation (always runs, in every environment).** Permissions,
 *      system roles, positions, release formats and site settings are declared
 *      in code and must exist in the database for the app to work. This part is
 *      idempotent and safe to run against production after a deploy that adds a
 *      permission.
 *
 *   2. **Demo content (development only).** Projects, episodes, releases, news
 *      and team members, so a fresh clone has something to look at. This part
 *      refuses to run when NODE_ENV=production.
 *
 * The owner account's password comes from SEED_OWNER_PASSWORD, or is generated
 * and printed once. It is never hard-coded — a default admin password is how
 * self-hosted apps end up compromised within hours of going live.
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';

const db = new PrismaClient();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing
//
// Duplicated from `src/lib/auth/password.ts` rather than imported: the seed runs
// through tsx outside Next's module graph, and that module is marked
// `server-only`. The format must stay in sync — there is a test asserting that.
// ─────────────────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  const N = 2 ** Number(process.env.AUTH_SCRYPT_LOG_N ?? 15);
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Declarations mirrored from src/lib/auth/permissions.ts
// ─────────────────────────────────────────────────────────────────────────────

const PERMISSIONS: Array<{ key: string; group: string; description: string }> = [
  { key: 'project:read', group: 'Projektek', description: 'Piszkozat projektek megtekintése' },
  { key: 'project:write', group: 'Projektek', description: 'Projektek létrehozása és szerkesztése' },
  { key: 'project:publish', group: 'Projektek', description: 'Projektek publikálása és archiválása' },
  { key: 'project:delete', group: 'Projektek', description: 'Projektek törlése' },
  { key: 'episode:write', group: 'Epizódok', description: 'Epizódok és munkafolyamat kezelése' },
  { key: 'episode:delete', group: 'Epizódok', description: 'Epizódok törlése' },
  { key: 'release:write', group: 'Kiadások', description: 'Kiadások és letöltési linkek kezelése' },
  { key: 'release:publish', group: 'Kiadások', description: 'Kiadások publikálása' },
  { key: 'release:delete', group: 'Kiadások', description: 'Kiadások törlése' },
  { key: 'news:write', group: 'Hírek', description: 'Hírek írása és szerkesztése' },
  { key: 'news:publish', group: 'Hírek', description: 'Hírek publikálása' },
  { key: 'news:delete', group: 'Hírek', description: 'Hírek törlése' },
  { key: 'faq:write', group: 'Tartalom', description: 'GYIK bejegyzések kezelése' },
  { key: 'media:write', group: 'Tartalom', description: 'Médiatár feltöltés és kezelés' },
  { key: 'media:delete', group: 'Tartalom', description: 'Médiafájlok törlése' },
  { key: 'team:write', group: 'Csapat', description: 'Csapattagok és pozíciók kezelése' },
  { key: 'team:delete', group: 'Csapat', description: 'Csapattagok törlése' },
  { key: 'comment:moderate', group: 'Közösség', description: 'Hozzászólások moderálása' },
  { key: 'contact:read', group: 'Közösség', description: 'Beérkezett üzenetek olvasása' },
  { key: 'contact:write', group: 'Közösség', description: 'Üzenetek kezelése és megválaszolása' },
  { key: 'user:read', group: 'Felhasználók', description: 'Felhasználói fiókok listázása' },
  { key: 'user:write', group: 'Felhasználók', description: 'Fiókok szerkesztése, tiltása' },
  { key: 'user:delete', group: 'Felhasználók', description: 'Fiókok törlése' },
  { key: 'role:manage', group: 'Felhasználók', description: 'Szerepkörök és jogosultságok kezelése' },
  { key: 'settings:read', group: 'Rendszer', description: 'Oldalbeállítások megtekintése' },
  { key: 'settings:write', group: 'Rendszer', description: 'Oldalbeállítások módosítása' },
  { key: 'audit:read', group: 'Rendszer', description: 'Audit napló megtekintése' },
  { key: 'stats:read', group: 'Rendszer', description: 'Statisztikák és riportok megtekintése' },
  { key: 'admin:access', group: 'Rendszer', description: 'Belépés az adminisztrációs felületre' },
];

const STAFF = [
  'admin:access',
  'project:read',
  'project:write',
  'episode:write',
  'release:write',
  'media:write',
  'stats:read',
];

const EDITOR = [
  ...STAFF,
  'project:publish',
  'release:publish',
  'news:write',
  'news:publish',
  'faq:write',
  'team:write',
];

const MODERATOR = [
  'admin:access',
  'project:read',
  'comment:moderate',
  'contact:read',
  'contact:write',
  'user:read',
  'stats:read',
];

const ADMIN = [
  ...new Set([
    ...EDITOR,
    ...MODERATOR,
    'project:delete',
    'episode:delete',
    'release:delete',
    'news:delete',
    'media:delete',
    'team:delete',
    'user:write',
    'settings:read',
    'settings:write',
    'audit:read',
  ]),
];

const ROLES = [
  {
    key: 'owner',
    name: 'Tulajdonos',
    description: 'Teljes hozzáférés a rendszer minden funkciójához.',
    rank: 0,
    color: '#f761a8',
    permissions: PERMISSIONS.map((permission) => permission.key),
  },
  {
    key: 'admin',
    name: 'Adminisztrátor',
    description: 'Teljes tartalom- és felhasználókezelés, a szerepkörök kivételével.',
    rank: 10,
    color: '#ab7ffb',
    permissions: ADMIN,
  },
  {
    key: 'editor',
    name: 'Szerkesztő',
    description: 'Projektek, kiadások és hírek publikálása.',
    rank: 30,
    color: '#fb923c',
    permissions: EDITOR,
  },
  {
    key: 'staff',
    name: 'Stáb',
    description: 'Munkafolyamat és kiadások szerkesztése publikálás nélkül.',
    rank: 50,
    color: '#c084fc',
    permissions: STAFF,
  },
  {
    key: 'moderator',
    name: 'Moderátor',
    description: 'Hozzászólások és beérkező üzenetek kezelése.',
    rank: 60,
    color: '#ec3f92',
    permissions: MODERATOR,
  },
  {
    key: 'member',
    name: 'Tag',
    description: 'Alapértelmezett szerepkör regisztrált felhasználóknak.',
    rank: 100,
    color: '#94a3b8',
    permissions: [],
  },
];

const POSITIONS = [
  { key: 'translator', name: 'Fordító', nameEn: 'Translator', color: '#f761a8', sortOrder: 10 },
  { key: 'timer', name: 'Időzítő', nameEn: 'Timer', color: '#c084fc', sortOrder: 20 },
  { key: 'typesetter', name: 'Formázó', nameEn: 'Typesetter', color: '#ab7ffb', sortOrder: 30 },
  { key: 'editor', name: 'Lektor', nameEn: 'Editor', color: '#fb923c', sortOrder: 40 },
  { key: 'encoder', name: 'Enkóder', nameEn: 'Encoder', color: '#ec3f92', sortOrder: 50 },
  { key: 'qc', name: 'Minőségellenőr', nameEn: 'Quality Check', color: '#60a5fa', sortOrder: 60 },
  { key: 'karaoke', name: 'Karaoke', nameEn: 'Karaoke', color: '#fb7185', sortOrder: 70 },
  { key: 'manager', name: 'Projektvezető', nameEn: 'Project Manager', color: '#22c55e', sortOrder: 5 },
];

const GENRES = [
  ['akcio', 'Akció', '#fb7185'],
  ['kaland', 'Kaland', '#fb923c'],
  ['dráma', 'Dráma', '#ab7ffb'],
  ['vígjáték', 'Vígjáték', '#c084fc'],
  ['fantasy', 'Fantasy', '#c2acff'],
  ['sci-fi', 'Sci-fi', '#f761a8'],
  ['romantikus', 'Romantikus', '#ec3f92'],
  ['thriller', 'Thriller', '#ef4444'],
  ['misztikus', 'Misztikus', '#8656f5'],
  ['iskola', 'Iskola', '#60a5fa'],
  ['zene', 'Zene', '#22c55e'],
  ['szeletek', 'Hétköznapok', '#94a3b8'],
] as const;

const RELEASE_FORMATS = [
  {
    key: 'mkv-softsub',
    label: 'MKV (soft felirat)',
    container: 'mkv',
    isSoftsub: true,
    description: 'Külön feliratsáv, kikapcsolható. Ez az alapértelmezett kiadásunk.',
    sortOrder: 10,
  },
  {
    key: 'mp4-hardsub',
    label: 'MP4 (beégetett)',
    container: 'mp4',
    isSoftsub: false,
    description: 'Régebbi eszközökhöz és telefonokhoz.',
    sortOrder: 20,
  },
  {
    key: 'mkv-remux',
    label: 'MKV Remux',
    container: 'mkv',
    isSoftsub: true,
    description: 'Vágatlan forrás, maximális minőség, nagy fájlméret.',
    sortOrder: 30,
  },
];

const STORAGE_HOSTS = [
  { key: 'nyaa', name: 'Nyaa', sortOrder: 10 },
  { key: 'gdrive', name: 'Google Drive', sortOrder: 20 },
  { key: 'mega', name: 'MEGA', sortOrder: 30 },
  { key: 'cdn', name: 'Yonagi CDN', sortOrder: 5 },
];

const SETTINGS: Array<{
  key: string;
  value: Prisma.InputJsonValue;
  group: string;
  label: string;
  description?: string;
  isPublic: boolean;
}> = [
  { key: 'siteName', value: 'Yonagi Fansub', group: 'general', label: 'Oldal neve', isPublic: true },
  {
    key: 'siteTagline',
    value: 'Magyar anime feliratok, éjszakai csendben készítve.',
    group: 'general',
    label: 'Szlogen',
    isPublic: true,
  },
  {
    key: 'siteDescription',
    value:
      'A Yonagi Fansub magyar feliratokat készít anime sorozatokhoz és filmekhez. Friss kiadások, projektállapotok és letöltések egy helyen.',
    group: 'seo',
    label: 'Alapértelmezett meta leírás',
    isPublic: true,
  },
  { key: 'registrationOpen', value: true, group: 'features', label: 'Regisztráció engedélyezve', isPublic: true },
  { key: 'commentsEnabled', value: true, group: 'features', label: 'Hozzászólások engedélyezve', isPublic: true },
  {
    key: 'commentsRequireApproval',
    value: false,
    group: 'features',
    label: 'Hozzászólások előzetes jóváhagyása',
    isPublic: false,
  },
  { key: 'contactFormEnabled', value: true, group: 'features', label: 'Kapcsolati űrlap engedélyezve', isPublic: true },
  { key: 'maintenanceMode', value: false, group: 'features', label: 'Karbantartási mód', isPublic: true },
  { key: 'indexingEnabled', value: true, group: 'seo', label: 'Keresőmotorok általi indexelés', isPublic: true },
  { key: 'contactEmail', value: 'info@yonagifansub.hu', group: 'general', label: 'Nyilvános kapcsolati e-mail', isPublic: true },
  { key: 'takedownEmail', value: 'legal@yonagifansub.hu', group: 'legal', label: 'Jogi / takedown e-mail', isPublic: true },
];

const FAQ = [
  {
    category: 'download',
    question: 'Hogyan tudom letölteni a kiadásaitokat?',
    answer:
      'Nyisd meg a kívánt epizód oldalát, és válaszd ki a neked megfelelő tükröt a **Letöltés** panelen. Több forrást is kínálunk — ha az egyik lassú, próbáld a másikat.',
    sortOrder: 10,
  },
  {
    category: 'download',
    question: 'Mit jelent a „soft felirat” és a „beégetett”?',
    answer:
      'A **soft feliratos** MKV kiadásban a felirat külön sávon van: ki-be kapcsolható, a betűméret állítható. A **beégetett** MP4-ben a felirat a képbe van írva — régebbi lejátszókhoz és okostévékhez.',
    sortOrder: 20,
  },
  {
    category: 'download',
    question: 'Mi az a v2 egy kiadás mellett?',
    answer:
      'Javított verzió. Ha hibát találunk (elgépelés, csúszó időzítés, formázási gond), új verziót adunk ki. A javítás leírása mindig ott van a kiadásnál.',
    sortOrder: 30,
  },
  {
    category: 'projects',
    question: 'Mikor jelenik meg a következő rész?',
    answer:
      'Pontos dátumot nem ígérünk — önkéntes csapat vagyunk. A projektoldalon viszont **valós időben látod**, hol tart a munka: fordítás, időzítés, formázás, lektorálás, enkódolás és ellenőrzés külön-külön.',
    sortOrder: 10,
  },
  {
    category: 'projects',
    question: 'Kérhetek új projektet?',
    answer:
      'Igen, a [kapcsolati űrlapon](/kapcsolat) a „Projektjavaslat” kategóriával. Nem tudunk mindent bevállalni, de minden javaslatot elolvasunk.',
    sortOrder: 20,
  },
  {
    category: 'team',
    question: 'Hogyan csatlakozhatok a csapathoz?',
    answer:
      'Nézd meg a [Csatlakozz](/csatlakozz) oldalt. Kezdőket is szívesen látunk — betanítunk, csak megbízhatóság kell hozzá.',
    sortOrder: 10,
  },
  {
    category: 'technical',
    question: 'Melyik lejátszót ajánljátok?',
    answer:
      'MKV kiadásainkhoz **mpv** vagy **VLC**. Windowsra az mpv + a rendszerre telepített betűtípusok adják a leghűbb formázást.',
    sortOrder: 10,
  },
  {
    category: 'general',
    question: 'Kell fizetni bármiért?',
    answer:
      'Nem. Nincs fizetős tartalom, nincs hirdetés, és adományt sem fogadunk el. A kiadásaink díjmentesek és azok is maradnak.',
    sortOrder: 10,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

async function seedAccessControl() {
  console.log('→ Jogosultságok és szerepkörök szinkronizálása…');

  for (const permission of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { group: permission.group, description: permission.description },
    });
  }

  // Prune permissions that no longer exist in code, so the matrix cannot drift.
  const removed = await db.permission.deleteMany({
    where: { key: { notIn: PERMISSIONS.map((permission) => permission.key) } },
  });
  if (removed.count > 0) console.log(`  ${removed.count} elavult jogosultság eltávolítva`);

  for (const role of ROLES) {
    const record = await db.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        rank: role.rank,
        color: role.color,
        isSystem: true,
      },
      // `color` belongs in the update alongside name and rank: all four are
      // declared here, and leaving the colour out meant a rebrand reached new
      // installs only — an existing database kept the old palette through every
      // reseed, with no way to pick up the new one.
      update: {
        name: role.name,
        description: role.description,
        rank: role.rank,
        color: role.color,
        isSystem: true,
      },
    });

    const permissions = await db.permission.findMany({
      where: { key: { in: role.permissions } },
      select: { id: true },
    });

    await db.rolePermission.deleteMany({ where: { roleId: record.id } });
    if (permissions.length > 0) {
      await db.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: record.id,
          permissionId: permission.id,
        })),
      });
    }
  }

  console.log(`  ${PERMISSIONS.length} jogosultság, ${ROLES.length} szerepkör kész`);
}

async function seedReferenceData() {
  console.log('→ Törzsadatok…');

  for (const position of POSITIONS) {
    await db.position.upsert({
      where: { key: position.key },
      create: position,
      update: position,
    });
  }

  for (const [slug, name, color] of GENRES) {
    await db.genre.upsert({
      where: { slug },
      create: { slug, name, color },
      update: { name, color },
    });
  }

  for (const format of RELEASE_FORMATS) {
    await db.releaseFormat.upsert({
      where: { key: format.key },
      create: format,
      update: format,
    });
  }

  for (const host of STORAGE_HOSTS) {
    await db.storageHost.upsert({
      where: { key: host.key },
      create: host,
      update: { name: host.name, sortOrder: host.sortOrder },
    });
  }

  for (const setting of SETTINGS) {
    await db.siteSetting.upsert({
      where: { key: setting.key },
      create: setting,
      // Only the metadata is refreshed: an admin's chosen value must survive
      // a re-seed, or every deploy would silently reset the site's settings.
      update: {
        group: setting.group,
        label: setting.label,
        description: setting.description,
        isPublic: setting.isPublic,
      },
    });
  }

  for (const entry of FAQ) {
    const existing = await db.faqEntry.findFirst({ where: { question: entry.question } });
    if (existing) {
      await db.faqEntry.update({ where: { id: existing.id }, data: entry });
    } else {
      await db.faqEntry.create({ data: entry });
    }
  }

  console.log(
    `  ${POSITIONS.length} pozíció, ${GENRES.length} műfaj, ${RELEASE_FORMATS.length} formátum, ${FAQ.length} GYIK`,
  );
}

/**
 * Tulajdonosi fiók — csak akkor, ha kifejezetten kérik.
 *
 * Alapértelmezés szerint a seed NEM hoz létre tulajdonost. Helyette az első
 * regisztráló kapja meg a tulajdonosi szerepkört (lásd `registerUser` a
 * `src/server/auth-service.ts`-ben), ami két gyakorlati problémát old meg
 * egyszerre: nem kell egy generált jelszót kihalászni a deploy logból, és nem
 * kell működő SMTP ahhoz, hogy be lehessen lépni először.
 *
 * A `SEED_OWNER_PASSWORD` megadásával kérhető a régi viselkedés — zárt
 * telepítésnél, ahol a regisztrációs ablakot meg sem akarod nyitni, ez a
 * helyes választás.
 */
async function seedOwner(): Promise<{ email: string; password: string | null }> {
  const email = (process.env.SEED_OWNER_EMAIL ?? 'owner@yonagifansub.hu').toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    console.log(`→ Tulajdonosi fiók már létezik (${email}), változatlan.`);
    return { email, password: null };
  }

  const provided = process.env.SEED_OWNER_PASSWORD;
  if (!provided || provided.length < 10) {
    const userCount = await db.user.count();
    if (userCount === 0) {
      console.log('→ Tulajdonosi fiók nem készült.');
      console.log('  Az ELSŐ regisztráló kapja a tulajdonosi jogosultságot.');
      console.log('  (Zárt telepítéshez: SEED_OWNER_PASSWORD=… és futtasd újra.)');
    } else {
      console.log(`→ Tulajdonosi fiók nem készült (${userCount} felhasználó már létezik).`);
    }
    return { email, password: null };
  }

  const ownerRole = await db.role.findUniqueOrThrow({ where: { key: 'owner' } });
  const password = provided;

  await db.user.create({
    data: {
      email,
      username: 'yonagi',
      displayName: 'Yonagi',
      passwordHash: hashPassword(password),
      roleId: ownerRole.id,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      preferences: {
        notifyNewRelease: true,
        notifyNewsPost: true,
        notifyCommentReply: true,
        emailDigest: 'off',
        reducedMotion: false,
      },
    },
  });

  console.log(`→ Tulajdonosi fiók létrehozva: ${email}`);
  return { email, password: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo content (development only)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PROJECTS = [
  {
    slug: 'yoru-no-shizuku',
    title: 'Yoru no Shizuku',
    titleRomaji: 'Yoru no Shizuku',
    titleNative: '夜の雫',
    titleEnglish: 'Drops of Night',
    synonyms: ['YnS', 'Drops of Night'],
    synopsis:
      'Egy kisvárosi könyvtárosnő minden éjjel ugyanazt az álmot látja: egy tengerparti fiút, aki lámpást gyújt a hullámok fölött. Amikor a városba érkezik egy fiatal restaurátor, kiderül, hogy az álom nem az övé — hanem egy hetven éve elhallgatott történeté.',
    type: 'TV' as const,
    status: 'ONGOING' as const,
    season: 'FALL' as const,
    seasonYear: 2026,
    totalEpisodes: 12,
    studio: 'Studio Anagura',
    source: 'Eredeti',
    ageRating: 'PG13' as const,
    accentColor: '#f761a8',
    isFeatured: true,
    genres: ['dráma', 'misztikus', 'romantikus'],
    episodes: 7,
  },
  {
    slug: 'kagerou-line',
    title: 'Kagerou Line',
    titleRomaji: 'Kagerou Line',
    titleNative: '陽炎ライン',
    synonyms: ['KgL'],
    synopsis:
      'A 2049-es Tokió alatt fut a Kagerou vonal: egy metró, amely olyan állomásokon áll meg, amelyek hivatalosan nem léteznek. Egy jegyellenőr és egy hackerlány kideríti, miért nem tér vissza senki a tizenharmadik megállóról.',
    type: 'TV' as const,
    status: 'ONGOING' as const,
    season: 'SUMMER' as const,
    seasonYear: 2026,
    totalEpisodes: 24,
    studio: 'Neon Fugu',
    source: 'Manga',
    ageRating: 'R17' as const,
    accentColor: '#ab7ffb',
    isFeatured: true,
    genres: ['sci-fi', 'thriller', 'akcio'],
    episodes: 11,
  },
  {
    slug: 'shiokaze-cafe',
    title: 'Shiokaze Café',
    titleRomaji: 'Shiokaze Kafe',
    titleNative: '潮風カフェ',
    synonyms: ['Sea Breeze Café'],
    synopsis:
      'Egy tengerparti kávézó, négy alkalmazott, és minden epizódban egy vendég, aki nem azért jött, amiért mondja. Csendes, meleg sorozat arról, hogy a hallgatás is lehet beszélgetés.',
    type: 'TV' as const,
    status: 'COMPLETED' as const,
    season: 'SPRING' as const,
    seasonYear: 2025,
    totalEpisodes: 12,
    studio: 'Hakoniwa Works',
    source: 'Light novel',
    ageRating: 'PG' as const,
    accentColor: '#c084fc',
    isFeatured: true,
    genres: ['szeletek', 'vígjáték', 'dráma'],
    episodes: 12,
  },
  {
    slug: 'hoshimori-no-uta',
    title: 'Hoshimori no Uta',
    titleRomaji: 'Hoshimori no Uta',
    titleNative: '星守の唄',
    synonyms: ['Song of the Starkeeper'],
    synopsis:
      'Egy vándorzenész és egy néma lány végigjárják a birodalom csillagtornyait, hogy újra felhangolják őket, mielőtt kialszik az utolsó is.',
    type: 'MOVIE' as const,
    status: 'COMPLETED' as const,
    season: 'WINTER' as const,
    seasonYear: 2024,
    totalEpisodes: 1,
    studio: 'Kagami Animation',
    source: 'Eredeti',
    ageRating: 'G' as const,
    accentColor: '#fb923c',
    isFeatured: false,
    genres: ['fantasy', 'zene', 'kaland'],
    episodes: 1,
  },
  {
    slug: 'ame-to-tetsu',
    title: 'Ame to Tetsu',
    titleRomaji: 'Ame to Tetsu',
    titleNative: '雨と鉄',
    synonyms: ['Rain and Iron'],
    synopsis:
      'Egy leszerelt harcirobot és a mechanikus, aki nem tudja szétszerelni. Hat epizód arról, mennyit ér egy ígéret, ha az egyik fél nem tud hazudni.',
    type: 'OVA' as const,
    status: 'ANNOUNCED' as const,
    season: 'WINTER' as const,
    seasonYear: 2027,
    totalEpisodes: 6,
    studio: 'Studio Anagura',
    source: 'Manga',
    ageRating: 'PG13' as const,
    accentColor: '#ec3f92',
    isFeatured: false,
    genres: ['sci-fi', 'dráma'],
    episodes: 0,
  },
];

const DEMO_MEMBERS = [
  {
    slug: 'kaito',
    name: 'Kaito',
    tagline: 'Alapító · fordító és projektvezető',
    bio: 'Japánul tanulok tíz éve, és még mindig találok szavakat, amiket nem ismerek. A Yonagit 2022-ben indítottam, mert unatkoztam egy karantén alatt.\n\nAmit a legjobban szeretek: azt a pillanatot, amikor egy sor magyarul is *pont* úgy szól, ahogy japánul.',
    positions: ['manager', 'translator'],
    isFounder: true,
    sortOrder: 1,
    accentColor: '#f761a8',
  },
  {
    slug: 'mira',
    name: 'Mira',
    tagline: 'Formázó · a betűtípusok őre',
    bio: 'Ha egy táblafelirat nem illeszkedik a képhez, nekem az fizikai fájdalom. Grafikus vagyok civilben.',
    positions: ['typesetter', 'karaoke'],
    isFounder: true,
    sortOrder: 2,
    accentColor: '#ab7ffb',
  },
  {
    slug: 'aron',
    name: 'Áron',
    tagline: 'Enkóder · bitrátafüggő',
    bio: 'Két dolgot csinálok: enkódolok, és magyarázom, miért nem kell 4K-ban kiadni egy 2003-as TV-rippet.',
    positions: ['encoder', 'qc'],
    isFounder: false,
    sortOrder: 3,
    accentColor: '#fb923c',
  },
  {
    slug: 'juli',
    name: 'Juli',
    tagline: 'Lektor · vesszőparipa',
    bio: 'Magyar szakos vagyok, és igen, észreveszem. Minden feliratot legalább kétszer olvasok át.',
    positions: ['editor', 'translator'],
    isFounder: false,
    sortOrder: 4,
    accentColor: '#c084fc',
  },
  {
    slug: 'nao',
    name: 'Nao',
    tagline: 'Időzítő · ezredmásodpercek',
    bio: 'A jó időzítést nem veszed észre. Pont ez benne a jó.',
    positions: ['timer'],
    isFounder: false,
    sortOrder: 5,
    accentColor: '#ec3f92',
  },
];

const DEMO_NEWS = [
  {
    slug: 'yoru-no-shizuku-bejelentes',
    title: 'Új projekt: Yoru no Shizuku',
    category: 'bejelentes',
    excerpt:
      'Az őszi szezon legszebb sorozatát visszük — heti kiadással, teljes formázással, karaokéval.',
    content: `Hosszú keresés után megvan az őszi fő projektünk: a **Yoru no Shizuku**.

## Miért ez?

Három dolog miatt:

1. **A forgatókönyv.** Az első két rész forgatókönyve olyan, mint egy jól megírt novella — nincs benne felesleges mondat.
2. **A hangzás.** Az OP és az ED is él-zenekari felvétel, és a karaoke miatt Mira már előre örül.
3. **Senki más nem viszi.** Ez a döntő érv: ahol van jó magyar felirat, oda mi nem megyünk.

## Mire számíts?

| Amit adunk | Részletek |
| --- | --- |
| Kiadási ütem | Heti, jellemzően a japán adás után 3–5 nappal |
| Formátum | MKV soft felirat (1080p) és MP4 beégetett (720p) |
| Karaoke | Igen, OP és ED egyaránt |
| Táblafeliratok | Teljes formázással |

> A minőség előbbre való a sebességnél. Ha csúszunk, azért csúszunk, mert valami még nem elég jó.

Az aktuális állapotot mindig megnézheted a [projekt oldalán](/projektek/yoru-no-shizuku) — a hat munkafázis külön-külön követhető.`,
    isPinned: true,
    daysAgo: 5,
  },
  {
    slug: 'shiokaze-cafe-batch',
    title: 'Shiokaze Café – teljes batch elérhető',
    category: 'kiadas',
    excerpt: 'Mind a 12 rész, javított feliratokkal, egyben letölthető.',
    content: `Elkészült a **Shiokaze Café** teljes batch-e.

A batch nem egyszerű összefűzés: minden részt újralektoráltunk, és az első négy epizód időzítését is átnéztük — azokat még akkor csináltuk, amikor Nao épp tanulta a szakmát.

### Változások az egyedi kiadásokhoz képest

- Egységesített megszólítások (a 3. részben Yuuki még magázta Harukát, utána már nem)
- Javított táblafeliratok a 7. és 9. részben
- Új, konzisztens betűkészlet mindenhol
- Az ED karaoke időzítése újra lett rakva

Köszönjük a türelmet — és külön köszönet azoknak, akik hibát jelentettek.`,
    isPinned: false,
    daysAgo: 12,
  },
  {
    slug: 'csapatbovites-2026',
    title: 'Keresünk időzítőt és formázót',
    category: 'csapat',
    excerpt: 'Két pozícióba is felveszünk. Kezdőket is — betanítunk.',
    content: `Nőtt a projektszámunk, és ez most már látszik a kiadási ütemen is. Ezért **időzítőt és formázót keresünk**.

## Mit kell tudni?

Semmit előre. Tényleg. Amit várunk:

- Heti pár óra, kiszámíthatóan
- Ha csúszol, szólj — ennyi az egész
- Hajlandóság a visszajelzések beépítésére

A többit megtanítjuk. Mindkét pozícióhoz van saját, magyar nyelvű anyagunk, és mentort is kapsz az első pár epizódra.

## Hogyan jelentkezz?

Írj a [kapcsolati űrlapon](/kapcsolat) a „Csatlakoznék a csapathoz” kategóriával. Kapsz egy rövid próbafeladatot — nem vizsga, csak látni szeretnénk, hogyan dolgozol.`,
    isPinned: false,
    daysAgo: 21,
  },
];

const NEWS_CATEGORIES = [
  { slug: 'bejelentes', name: 'Bejelentés', color: '#f761a8' },
  { slug: 'kiadas', name: 'Kiadás', color: '#c084fc' },
  { slug: 'csapat', name: 'Csapat', color: '#fb923c' },
  { slug: 'technikai', name: 'Technikai', color: '#ab7ffb' },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function seedDemoContent(ownerEmail: string) {
  console.log('→ Demó tartalom (fejlesztői környezet)…');

  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const positions = await db.position.findMany();
  const positionByKey = new Map(positions.map((position) => [position.key, position.id]));
  const genres = await db.genre.findMany();
  const genreBySlug = new Map(genres.map((genre) => [genre.slug, genre.id]));

  // Team
  const members = [];
  for (const member of DEMO_MEMBERS) {
    const record = await db.teamMember.upsert({
      where: { slug: member.slug },
      create: {
        slug: member.slug,
        name: member.name,
        tagline: member.tagline,
        bio: member.bio,
        accentColor: member.accentColor,
        isFounder: member.isFounder,
        sortOrder: member.sortOrder,
        joinedAt: daysAgo(member.isFounder ? 1200 : 400),
        socials: { discord: member.slug },
        positions: {
          create: member.positions.map((key, index) => ({
            positionId: positionByKey.get(key)!,
            isPrimary: index === 0,
          })),
        },
      },
      update: { name: member.name, tagline: member.tagline, bio: member.bio },
    });
    members.push(record);
  }

  // News categories
  for (const category of NEWS_CATEGORIES) {
    await db.newsCategory.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, color: category.color },
    });
  }

  const formats = await db.releaseFormat.findMany();
  const hosts = await db.storageHost.findMany();
  const softsub = formats.find((format) => format.key === 'mkv-softsub')!;
  const hardsub = formats.find((format) => format.key === 'mp4-hardsub')!;

  // Projects, episodes, releases
  for (const [index, project] of DEMO_PROJECTS.entries()) {
    const record = await db.project.upsert({
      where: { slug: project.slug },
      create: {
        slug: project.slug,
        title: project.title,
        titleRomaji: project.titleRomaji,
        titleNative: project.titleNative,
        titleEnglish: 'titleEnglish' in project ? project.titleEnglish : null,
        synonyms: [...project.synonyms],
        synopsis: project.synopsis,
        type: project.type,
        status: project.status,
        publishStatus: 'PUBLISHED',
        season: project.season,
        seasonYear: project.seasonYear,
        totalEpisodes: project.totalEpisodes,
        studio: project.studio,
        source: project.source,
        ageRating: project.ageRating,
        accentColor: project.accentColor,
        isFeatured: project.isFeatured,
        durationMin: project.type === 'MOVIE' ? 104 : 24,
        publishedAt: daysAgo(120 - index * 10),
        viewCount: 400 + index * 137,
        createdById: owner.id,
        genres: {
          create: project.genres
            .map((slug) => genreBySlug.get(slug))
            .filter((id): id is string => Boolean(id))
            .map((genreId) => ({ genreId })),
        },
      },
      update: { synopsis: project.synopsis, status: project.status },
    });

    // Credits: everyone works on everything, in their primary role.
    for (const member of members) {
      const definition = DEMO_MEMBERS.find((entry) => entry.slug === member.slug)!;
      const positionId = positionByKey.get(definition.positions[0]!)!;

      await db.projectStaff.upsert({
        where: {
          projectId_teamMemberId_positionId: {
            projectId: record.id,
            teamMemberId: member.id,
            positionId,
          },
        },
        create: { projectId: record.id, teamMemberId: member.id, positionId },
        update: {},
      });
    }

    for (let number = 1; number <= project.episodes; number += 1) {
      const released = number <= project.episodes - (project.status === 'ONGOING' ? 1 : 0);
      const inProgress = !released;

      const episode = await db.episode.upsert({
        where: { projectId_number: { projectId: record.id, number } },
        create: {
          projectId: record.id,
          number,
          title: `${project.title} – ${number}. rész`,
          airedAt: daysAgo(90 - number * 7),
          durationSec: project.type === 'MOVIE' ? 6240 : 1420,
          status: released ? 'RELEASED' : 'IN_PROGRESS',
          progressTranslation: released ? 100 : 100,
          progressTiming: released ? 100 : 100,
          progressTypesetting: released ? 100 : 60,
          progressEditing: released ? 100 : 40,
          progressEncoding: released ? 100 : 0,
          progressQc: released ? 100 : 0,
        },
        update: {},
      });

      if (!released || inProgress) continue;

      for (const [formatIndex, format] of [softsub, hardsub].entries()) {
        await db.release.upsert({
          where: {
            episodeId_formatId_resolution_version: {
              episodeId: episode.id,
              formatId: format.id,
              resolution: formatIndex === 0 ? 'FHD_1080P' : 'HD_720P',
              version: 1,
            },
          },
          create: {
            projectId: record.id,
            episodeId: episode.id,
            kind: project.type === 'MOVIE' ? 'MOVIE' : 'EPISODE',
            version: 1,
            formatId: format.id,
            resolution: formatIndex === 0 ? 'FHD_1080P' : 'HD_720P',
            videoCodec: formatIndex === 0 ? 'H.264 10bit' : 'H.264',
            audioCodec: formatIndex === 0 ? 'FLAC 2.0' : 'AAC 2.0',
            subtitleFormat: format.isSoftsub ? 'ASS' : null,
            fileSizeBytes: BigInt(formatIndex === 0 ? 1_395_864_371 : 428_867_584),
            durationSec: project.type === 'MOVIE' ? 6240 : 1420,
            crc32: randomBytes(4).toString('hex').toUpperCase(),
            status: 'PUBLISHED',
            releasedAt: daysAgo(88 - number * 7),
            downloadCount: Math.round(800 / (number + 1)) + formatIndex * 40,
            createdById: owner.id,
            links: {
              create: hosts.slice(0, 3).map((host, hostIndex) => ({
                hostId: host.id,
                kind: host.key === 'nyaa' ? 'TORRENT' : 'DIRECT',
                label: null,
                // Placeholder targets: real URLs are configured per deployment.
                url: `https://example.invalid/${project.slug}/${number}/${format.key}`,
                isMirror: hostIndex > 0,
                priority: hostIndex,
                availability: 'ONLINE',
              })),
            },
          },
          update: {},
        });
      }
    }
  }

  // News
  const categories = await db.newsCategory.findMany();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  for (const post of DEMO_NEWS) {
    const words = post.content.split(/\s+/).length;

    await db.newsPost.upsert({
      where: { slug: post.slug },
      create: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        categoryId: categoryBySlug.get(post.category) ?? null,
        authorId: owner.id,
        status: 'PUBLISHED',
        publishedAt: daysAgo(post.daysAgo),
        isPinned: post.isPinned,
        readingMinutes: Math.max(1, Math.round(words / 200)),
        viewCount: 120 + post.daysAgo * 7,
      },
      update: { content: post.content, excerpt: post.excerpt },
    });
  }

  const [projectCount, episodeCount, releaseCount] = await Promise.all([
    db.project.count(),
    db.episode.count(),
    db.release.count(),
  ]);

  console.log(
    `  ${projectCount} projekt, ${episodeCount} epizód, ${releaseCount} kiadás, ${DEMO_NEWS.length} hír, ${members.length} csapattag`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n夜凪  Yonagi Fansub – adatbázis feltöltése\n');

  await seedAccessControl();
  await seedReferenceData();
  const owner = await seedOwner();

  if (IS_PRODUCTION) {
    console.log('→ Demó tartalom kihagyva (NODE_ENV=production).');
  } else {
    await seedDemoContent(owner.email);
  }

  console.log('\n✓ Kész.\n');

  if (owner.password) {
    console.log('──────────────────────────────────────────────────────────');
    console.log('  Tulajdonosi fiók létrehozva. A jelszó CSAK MOST látható:');
    console.log(`    E-mail:  ${owner.email}`);
    console.log(`    Jelszó:  ${owner.password}`);
    console.log('  Mentsd el, majd az első belépés után változtasd meg.');
    console.log('──────────────────────────────────────────────────────────\n');
  }
}

main()
  .catch((error) => {
    console.error('\n✗ A seed futása megszakadt:\n', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
