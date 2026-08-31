# Architektúra

## A vezérlő elv

Egy fansub csapat önkéntesekből áll. Ami üzemeltetést igényel, azt előbb-utóbb
senki nem fogja csinálni. Ezért a rendszer **egy deploy egység**, **egy
adatbázis**, és semmi olyan komponens, ami nélkül ne tudna elindulni.

Minden opcionális infrastruktúra (Redis, SMTP, S3) mögött driver interfész áll,
alapértelmezett fallbackkel. Ha nincs Redis, a rate limiting memóriában fut. Ha
nincs SMTP, a levelek a logba mennek. A rendszer soha nem áll meg attól, hogy
egy kiegészítő szolgáltatás hiányzik.

---

## Rétegek

```
┌──────────────────────────────────────────────────────────────────┐
│  app/(site)          app/(auth)         app/admin                │
│  szerver komponensek, streamelt Suspense határokkal              │
└───────────┬──────────────────────────────────┬───────────────────┘
            │ közvetlen hívás                  │ fetch
            ▼                                  ▼
┌────────────────────────┐        ┌────────────────────────────────┐
│  src/server/*          │        │  app/api/v1/*                  │
│  olvasási szolgáltatás │        │  defineRoute() wrapper         │
│  (cache-elt)           │        └───────────┬────────────────────┘
└───────────┬────────────┘                    │
            │                                 ▼
            │                    ┌────────────────────────────────┐
            │                    │  src/server/admin/*            │
            │                    │  írási szolgáltatás            │
            │                    │  (audit + cache invalidálás)   │
            │                    └───────────┬────────────────────┘
            └─────────────┬──────────────────┘
                          ▼
                    ┌───────────┐
                    │  Prisma   │
                    └─────┬─────┘
                          ▼
                    PostgreSQL 16
```

### Miért olvas a szerver komponens közvetlenül?

Mert nincs miért ne. Egy RSC és a route handler ugyanabban a processzben fut; ha
a projektoldal HTTP-n keresztül hívná a saját API-ját, az egy fölösleges
szerializálás, egy fölösleges TCP kapcsolat és egy fölösleges hibaforrás lenne.

Az API attól még létezik és teljes: a böngésző interaktív részei, a jövőbeli
mobilalkalmazás és bármely külső integráció ugyanazokat a végpontokat
használja. Ugyanaz a service réteg szolgálja ki mindkettőt, tehát nem tud
szétcsúszni.

---

## A route factory

Az `src/lib/api/handler.ts` `defineRoute()` függvénye a rendszer legfontosabb
absztrakciója. Minden végpont rajta keresztül van definiálva:

```
request id → rate limit → CSRF/same-origin → autentikáció → jogosultság →
bemenet-validáció → handler → válaszboríték → hibaleképzés → hozzáférési napló
```

Ez nem kényelmi funkció, hanem strukturális garancia. Nem lehet olyan endpointot
írni, amelyik kimarad a rate limitből vagy elfelejt validálni, mert a
végpontfájl csak az üzleti logikát tartalmazza — a többi nem az ő dolga.

Egy tipikus route így néz ki teljes egészében:

```ts
export const POST = defineRoute({
  auth: 'project:write',        // jogosultság, nem szerepkör
  rateLimit: 'admin:write',
  body: projectWriteSchema,     // ugyanaz a séma, mint a kliensen
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createProject(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
```

---

## Cache stratégia

A rendszer **tag-alapú invalidálást** használ, nem TTL-t.

A publikus olvasási szolgáltatások `unstable_cache`-be vannak csomagolva, tag-ekkel
(`projects`, `releases`, `news`, `team`, `settings`). Az admin írási műveletek a
megfelelő tag-eket érvénytelenítik. Egy kiadás publikálása után a kiadásfolyam
azonnal friss — nem 60 másodperc múlva, és nem kell kitalálni egy TTL-t, ami
„elég jó".

```ts
// olvasás
export const getLatestReleases = cached(
  async (limit = 8) => db.release.findMany({ ... }),
  ['latest-releases'],
  { tags: [CACHE_TAGS.releases], revalidate: CACHE_TTL.short },
);

// írás
invalidateRelease(projectSlug, releaseId);   // → a fenti azonnal újratölt
```

A TTL másodlagos védőháló arra az esetre, ha egy háttérfolyamat (cron) módosít
adatot request kontextuson kívül, ahol a `revalidateTag` nem elérhető.

A tag-ek egyetlen helyen, az `src/lib/cache.ts`-ben vannak deklarálva. Elgépelt
tag = örökre elavult cache, ezért nincs szabad szöveges tag sehol.

---

## Adatáramlás: egy kiadás publikálása

Érdemes végigkövetni, mert ez a rendszer legösszetettebb művelete.

1. A szerkesztő a `/admin/kiadasok/[id]` oldalon `PUBLISHED`-re állítja az
   állapotot, és menti.
2. `PUT /api/v1/admin/releases/[id]` → `defineRoute` ellenőrzi a
   `release:write` jogot, a CSRF tokent, és validálja a törzset.
3. `updateRelease()` egy tranzakcióban:
   - törli azokat a linkeket, amiket a szerkesztő kivett az űrlapból,
   - a megmaradtakat frissíti **id alapján** (így a letöltésszámláló megmarad),
   - az újakat létrehozza,
   - frissíti magát a kiadást.
4. `invalidateRelease()` érvényteleníti a `releases`, `release:<id>`,
   `project:<slug>`, `projects` és `stats` tag-eket.
5. Audit bejegyzés készül a diff-fel (a titkos mezők redaktálva).
6. Ha az állapot **piszkozatból** lett publikált (nem egy már publikált kiadás
   szerkesztése), elindul a `notifyNewRelease()` — nem `await`-elve.
7. A fan-out lekérdezi azokat a követőket, akik kérnek értesítést, beszúrja az
   in-app értesítéseket egy `createMany`-vel, majd 50-es kötegekben küldi a
   leveleket. A HTTP válasz addigra rég visszament.

A 6. pont a lényeg: egy 5000 követős projektnél a „publikálás" gomb nem lehet
30 másodperces művelet.

---

## Skálázási út

A rendszer egy közepes fansub forgalmát (napi néhány tízezer oldalletöltés) egy
kis VPS-en kiszolgálja. Amikor ez kevés, a sorrend a következő:

**1. Redis rate limiting.** `RATE_LIMIT_DRIVER=redis`. Ez az egyetlen dolog, ami
két app példány esetén azonnal helytelenné válik: a memória-driver
példányonként számol, tehát két példánynál a limit duplázódik.

**2. Vízszintes skálázás.** Az app állapotmentes (a session az adatbázisban van,
nem memóriában), tehát több példány mögé tehető load balancer. Két dolog kell
hozzá: a Redis az előző pontból, és `MEDIA_DRIVER=s3` — a lokális média-driver
a saját lemezére ír, amit a többi példány nem lát. Egyik sem kódváltozás.

**3. Olvasási replika.** A forgalom ~95%-a olvasás. A Prisma `DATABASE_URL` egy
pooler mögé (PgBouncer, Neon, Supabase) mutathat, a `DIRECT_DATABASE_URL` pedig
a migrációkhoz marad direkt.

**4. Elosztott keresőmotor.** A teljes szöveges keresés már megvan
(`prisma/sql/04-fulltext.sql` + `src/server/search-fts.ts`), és a trigram
egyezés *mellett* fut, nem helyette — a kettő ellentétes irányban hibázik. Ha a
katalógus akkorára nő, hogy ez sem elég, a következő lépcső egy külön
keresőszolgáltatás (Meilisearch, Typesense); addig egy Postgres-en kívüli
komponens csak üzemeltetni való.

**5. Háttérsorok.** Az értesítési fan-out jelenleg detached promise. Nagyságrendi
növekedésnél ez egy job queue-ba kerül (BullMQ a már meglévő Redis fölött), a
`notifyNewRelease()` interfész változatlanul.

Ezek közül **egyiket sem** építettük meg előre. Mindegyiknek megvan a helye, ahol
be lehet illeszteni; addig nem tartunk fenn olyan komponenst, aminek nincs
dolga.

---

## Nyelvek

A felület **egynyelvű, magyar**, és ez döntés, nem hiányosság.

Egy magyar fansub közönsége magyar. Egy angol nyelvi réteg annak az olvasónak
szólna, aki a magyar feliratot úgysem tudja használni — cserébe minden
szövegdarabot kulcsok mögé kellene tenni. A jelenlegi szövegek nem
címkék: gondosan megírt, magyarul jól hangzó mondatok, tucatnyi
helyen ragozással, számnévi egyeztetéssel, egyes-többes szám szerinti
alakváltással. Kulcs–érték katalógusban ezek elszegényednek, és a fordítás
elkészülte után is folyamatos karbantartást kérnek: minden új képernyő két
nyelven kész, vagy egyik nyelven sem.

Amit viszont **kell** és meg is van: a *tartalom* nyelvének jelölése. A
`<html lang="hu">` mellett minden japán cím `lang="ja"`, a romaji
`lang="ja-Latn"` jelölést kap. Enélkül a képernyőolvasó magyar hanggal
próbálja felolvasni a kandzsit, és a böngésző rossz betűkészletet választ.
Ez a rész az internacionalizációból az, amiből ennek az oldalnak haszna van.

Ha egyszer mégis kell a többnyelvűség, a beillesztési pont a Next
`app/[locale]/` szegmense, alatta egy üzenetkatalógussal (`next-intl` vagy
saját megoldás). A szerverrétegen nem változtat semmit: az adatbázisban már ott
van a `titleRomaji`, `titleEnglish` és `titleNative` mező, tehát a katalógus
adatai eleve többnyelvűek — csak a felület szövegei nem.

---

## Hibakezelés

Három szint, három viselkedéssel:

| Szint | Hol | Mit tesz |
| --- | --- | --- |
| `AppError` taxonómia | `src/lib/errors.ts` | Minden várt hiba tipizált; a 4xx üzenete a felhasználónak szól, az 5xx-é soha nem hagyja el a szervert |
| Route boríték | `defineRoute` | Leképez JSON hibává request id-vel; 5xx-nél a részletek csak a logba mennek |
| React error boundary | `error.tsx`, `global-error.tsx` | Az oldal összeomlása helyett kezelhető képernyő, a `digest`-tel, amit a felhasználó be tud diktálni |

A Prisma hibakódjai (`P2002` egyediség, `P2025` nincs találat, `P2003`
hivatkozás) a `toAppError()`-ben képződnek le értelmes HTTP státuszra — így egy
duplikált slug 409-et ad, nem 500-at.

---

## Miért nincs külön „backend"

Mert két deployolható egység két helyen tud eltörni, két helyen kell frissíteni,
és két helyen kell konfigurálni a titkokat — egy önkéntes csapatnál ez az a
pont, ahol a rendszer elkezd elhanyagolódni.

A szétválasztás, amire szükség van, **logikai**, és megvan: a szerver
szolgáltatások (`src/server/*`) nem tudnak a HTTP-ről, a route-ok nem tudnak a
Prismáról, a komponensek nem tudnak egyikről sem. Ha egyszer valóban külön
szolgáltatás kell, a service réteg változatlanul kiemelhető.
