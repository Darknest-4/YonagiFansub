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

## A mappaszerkezet, és miért ilyen

```
src/
├── app/               Next.js route-ok. Belépési pont, semmi más.
│   ├── (site)/        a nyilvános oldal
│   ├── (auth)/        belépés, regisztráció, jelszó
│   ├── admin/         a szerkesztői felület
│   ├── api/           a HTTP API
│   └── _shell/        fejléc, lábléc, navigáció — az oldal kerete
│
├── features/          egy mappa domainenként; itt lakik minden üzleti szabály
│   ├── projects/      projekt és epizód
│   ├── watch/         előrehaladás, értékelés, követés, nézési lista
│   ├── video/         videóforrások, szolgáltatók, HLS, lejátszási token
│   ├── metadata/      AniList / Jikan import
│   ├── auth/  users/  comments/  news/  team/  media/
│   ├── notifications/ search/  settings/  faq/  contact/  stats/
│   └── maintenance/   az éjszakai karbantartás sorrendje
│
├── shared/            amit több feature használ
│   ├── ui/            a design system
│   ├── api/           defineRoute, válaszboríték, lapozás, rate limit, audit
│   ├── auth/          munkamenet, jogosultságok, oldalőrök
│   ├── validation/    séma-primitívek (email, slug, hexColor…)
│   └── lib/           cn, formázók, markdown, hibák, SEO, site-url
│
├── infrastructure/    a külvilág
│   ├── db.ts  cache.ts  logger.ts  env.ts  error-reporting.ts
│   ├── mail/          a levélküldés maga (Resend / SMTP / konzol)
│   ├── storage/       objektumtár (S3 / lokális), aláírás, MIME-típusok
│   └── http/          kimenő HTTP kliens újrapróbálkozással
│
└── content/           szerkesztői tartalom kódban (fejlesztési napló, jogi szövegek)
```

### Miért domain szerint, és nem közönség szerint

Korábban a bontás az volt, hogy **ki hívja**: `server/` az olvasásoknak,
`server/admin/` az írásoknak, `components/site/` a látogatónak,
`components/admin/` a szerkesztőnek. Ez négy helyre szórta szét ugyanazt a
domaint. Egy mező hozzáadása az epizódhoz négy fájlt érintett, és semmi nem
mondta ki, hogy a négy összetartozik.

A mostani bontás azt mondja meg, **miről szól**. Egy epizódmező ma egy mappán
belül van: séma, lekérdezés, írás, felület.

### Három döntés, amit érdemes indokolni

**A projekt és az epizód egy feature.** Az epizódnak nincs élete a projekten
kívül, a listalekérdezések összekapcsolják őket, és a láthatósági szűrő közös.
Külön mappában a kettő egymást importálta volna oda-vissza.

**A hozzáférés-vezérlés `shared/`, nem `features/auth/`.** A `defineRoute()`
maga függ tőle, a közös réteg pedig nem nyúlhat feature-be. Ezért a
*munkamenet, jogosultság, oldalőr* a `shared/auth/`-ban van, a *folyamatok* —
regisztráció, belépés, jelszó-visszaállítás — a `features/auth/`-ban.

**Az objektumtár és a kimenő HTTP `infrastructure/`.** Korábban a `lib/media`
és a `lib/anime` alatt ültek, ami azt üzente, hogy „a média feature birtokolja
az S3-at" és „az AniList birtokolja az újrapróbálkozást". Egyik sem igaz, és a
következő integráció az egyiket lemásolta volna.

---

## Rétegek és függési irányok

```
        app/                 route-ok, oldalak, az oldal kerete
          │
          ▼
      features/              üzleti szabályok, domainenként
          │
          ▼
       shared/               közös felület, API-váz, hozzáférés-vezérlés
          │
          ▼
   infrastructure/           adatbázis, cache, levél, tárhely, külső HTTP
```

A nyilak **lefelé** mutatnak, és ez nem konvenció, hanem ellenőrzött szabály:

| Réteg | Mit importálhat |
| --- | --- |
| `app/` | mindent |
| `features/` | más feature-t, `shared/`-ot, `infrastructure/`-t — `app/`-ot **nem** |
| `shared/` | `shared/`-ot és `infrastructure/`-t — feature-t és `app/`-ot **nem** |
| `infrastructure/` | `infrastructure/`-t és `shared/lib`-et — feature-t és `app/`-ot **nem** |

Ezt az ESLint kényszeríti ki (`no-restricted-imports` a `.eslintrc.json`-ban),
tehát a szabálysértés nem code review-n múlik, hanem `npm run lint`-en elbukik,
saját magyar hibaüzenettel.

**A feature-ök hívhatják egymást**, és ez szándékos. A `watch` tudja, mi az a
projekt; a `comments` értesítést küld a `notifications`-szel. Egy olyan szabály,
ami ezt tiltaná, csak eseménybuszt szülne ott, ahol egy függvényhívás elég — és
a körkörös függés amúgy is kizárt (`node scripts/…` méri, jelenleg 0).

### Miért olvas a szerver komponens közvetlenül

Mert nincs miért ne. Egy RSC és a route handler ugyanabban a processzben fut; ha
a projektoldal HTTP-n keresztül hívná a saját API-ját, az egy fölösleges
szerializálás, egy fölösleges TCP kapcsolat és egy fölösleges hibaforrás lenne.

Az API attól még létezik és teljes: a böngésző interaktív részei, a jövőbeli
mobilalkalmazás és bármely külső integráció ugyanazokat a végpontokat
használja. Ugyanaz a feature-réteg szolgálja ki mindkettőt, tehát nem tud
szétcsúszni.

---

## Hova kerül egy új…

### …feature

Új mappa a `src/features/` alá, és **csak annyi fájl, amennyi tényleg kell.**
A megszokott nevek, ha szükségesek:

```
features/valami/
├── queries.ts        olvasás (cache-elt, publikus)
├── service.ts        írás és szabályok
├── admin-service.ts  szerkesztői írás, MutationContext-tel
├── schemas.ts        a végpontok bemeneti alakjai (zod)
└── components/       a feature saját felülete
```

Nem kell mind. A `maintenance` egyetlen fájl, a `faq` három — ez nem hiányosság,
hanem az, hogy annyi van, amennyi. Ha egy feature 2-3 fájl, ne bontsd nyolc
almappára.

Ami **nem** kerül ide: semmi, amit két másik feature is használna. Az vagy a
`shared/`-ba tartozik, vagy — gyakrabban — kiderül, hogy nem is közös, csak
hasonlít.

### …API végpont

`src/app/api/v1/…/route.ts`, és a fájl **vékony**. A route dolga: melyik séma
validál, milyen jogosultság kell, mennyi a rate limit — aztán meghív egy
feature-függvényt.

```ts
export const PUT = defineRoute({
  auth: 'verified',
  rateLimit: 'rating:write',
  params,
  body: ratingSchema,
  handler: ({ params: { projectId }, body, user }) =>
    rateProject(user!.id, projectId, body.score),
});
```

Ha a handlerben `db.` szerepel, akkor rossz helyen van a kód. A `/api/health`
az egyetlen kivétel, és az sem lekérdez, hanem életjelet mér.

### …külső integráció

Új mappa az `src/infrastructure/` alá, ha a *szállítás* új (egy másik levélküldő,
egy másik objektumtár), és új feature, ha a *tartalom* új (egy Discord-integráció
a `features/discord/`-ba kerül, és az `infrastructure/http/upstream.ts`-t
használja kliensnek).

A határ ott van, hogy **cserélhető-e**. Az S3 cserélhető lokális lemezre anélkül,
hogy bármelyik feature megtudná — tehát infrastruktúra. Az AniList nem
cserélhető: ha eltűnik, a metaadat-import maga változik meg — tehát feature.

### …e-mail

A szöveg a feature-nél (`features/auth/mail.ts`, `features/notifications/mail.ts`,
`features/contact/mail.ts`), a küldés az `infrastructure/mail/transport.ts`-ben.
Az `infrastructure` nem tudja, mi áll a levélben; a feature nem tudja, hogyan
megy ki.

### …beállítás

Egy sor a `src/features/settings/definitions.ts` táblájába. A típus, az
alapérték és az `isPublic` innen jön, és a `getSettings()` mindig teljesen
kitöltött, típusos objektumot ad — nincs olyan hívó, akinek hiányzó kulccsal
kellene számolnia.

### …karbantartó lépés

Egy `Promise<number>`-t adó függvény a saját feature-ében, és egy `step()` hívás
a `features/maintenance/daily-job.ts`-ben. A sorrend ott van, mert az az egyetlen
döntés, ami sehol máshol nem látszana.

---

## Mi számít közösnek

A `shared/` nem szemetesláda. Három próbája van:

1. **Legalább két feature használja** — egy használó esetén a kód a
   feature-ben marad, akkor is, ha „általánosnak néz ki".
2. **Nem tud egyetlen domainről sem.** Ha a `shared/` egy feature-t importálna,
   a lint elbukik; ha *fogalmilag* tud róla (mondjuk „epizód" szerepel a
   nevében), akkor nincs jó helyen, csak a lint nem veszi észre.
3. **Nem üzleti szabály.** A formázás, a lapozás, a hibaboríték közös. A „mikor
   számít befejezettnek egy sorozat" kérdés soha.

Fordítva is igaz: az, hogy valami *ki tudná* szolgálni több feature-t, nem ok
arra, hogy közösnek nyilvánítsuk. A `password` zod-primitív azért került a
`features/auth/schemas.ts`-be, mert a jelszóházirendtől függ — ott a közös
rétegnek kellett volna a feature-ből importálnia.

---

## A route factory

A `src/shared/api/handler.ts` `defineRoute()` függvénye a rendszer legfontosabb
absztrakciója. Minden végpont rajta keresztül van definiálva:

```
request id → rate limit → CSRF/same-origin → autentikáció → jogosultság →
bemenet-validáció → handler → válaszboríték → hibaleképzés → hozzáférési napló
```

Ez nem kényelmi funkció, hanem strukturális garancia. Nem lehet olyan endpointot
írni, amelyik kimarad a rate limitből vagy elfelejt validálni, mert a
végpontfájl csak a hívást tartalmazza — a többi nem az ő dolga.

Ezért **nincs** API-oldali `requirePermission()` sem: létezett egy ilyen
függvénycsalád, soha semmi nem hívta, és a puszta léte kockázat volt. Egy
második jogosultsági API a hívás helyén helyesnek látszik, miközben kimarad
belőle minden, amit a route-gyár körülötte csinál.

---

## Az írási oldal: MutationContext

Minden szerkesztői írás ugyanazon a mintán megy át:

```
állapot betöltése → az átmenet ellenőrzése → írás tranzakcióban →
érintett cache-címkék ürítése → naplóbejegyzés
```

A sorrend nem esztétika. Az ürítés az írás *előtt* versenyezne egy párhuzamos
olvasással; a napló az írás *előtt* meg nem történt változást rögzítene.

A `mutationContext(user, meta)` (`shared/api/mutation-context.ts`) fűzi össze az
aktort, a request id-t és a kliens ujjlenyomatát, és a szolgáltatás egyetlen
`context.audit({...})` hívással zárja a műveletet. Öt laza paraméter helyett egy
objektum: a „naplóztuk?" kérdés így egy hívás megnézésével eldönthető.

---

## Cache stratégia

A rendszer **tag-alapú invalidálást** használ, nem TTL-t.

A publikus olvasási szolgáltatások `unstable_cache`-be vannak csomagolva,
tag-ekkel (`projects`, `project:<slug>`, `news`, `team`, `settings`, `stats`).
Az írási műveletek a megfelelő tag-eket érvénytelenítik: egy epizód publikálása
után a kezdőlap azonnal friss — nem 60 másodperc múlva, és nem kell kitalálni
egy TTL-t, ami „elég jó".

```ts
// olvasás
export const getPublicEpisodes = cached(
  async (projectId: string) => db.episode.findMany({ ... }),
  ['public-episodes'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.short },
);

// írás
invalidateProject(projectSlug);   // → a fenti azonnal újratölt
```

A TTL másodlagos védőháló arra az esetre, ha egy háttérfolyamat (cron) módosít
adatot request kontextuson kívül, ahol a `revalidateTag` nem elérhető.

A tag-ek egyetlen helyen, az `src/infrastructure/cache.ts`-ben vannak deklarálva.
Elgépelt tag = örökre elavult cache, ezért nincs szabad szöveges tag sehol.

---

## Adatáramlás: egy epizód publikálása

Érdemes végigkövetni, mert ez a rendszer legösszetettebb művelete.

1. A szerkesztő a `/admin/projektek/[id]` oldalon `RELEASED`-re állítja az
   epizód állapotát, és menti.
2. `PATCH /api/v1/admin/episodes/[id]` → a `defineRoute` ellenőrzi az
   `episode:write` jogot, a CSRF tokent, és validálja a törzset.
3. `updateEpisode()` (`features/projects/episode-admin-service.ts`) egy
   tranzakcióban frissíti az epizódot, és beállítja a `releasedAt`-et, ha ez az
   első megjelenés.
4. `invalidateProject()` érvényteleníti a `project:<slug>`, `projects` és
   `stats` tag-eket.
5. Audit bejegyzés készül a diff-fel (a titkos mezők redaktálva).
6. Ha az állapot **most** lett `RELEASED` (nem egy már megjelent rész
   szerkesztése), elindul a `notifyNewEpisode()` — nem `await`-elve.
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
hozzá: a Redis az előző pontból, és `MEDIA_DRIVER=s3` — a lokális tárhely-driver
a saját lemezére ír, amit a többi példány nem lát. Egyik sem kódváltozás.

**3. Olvasási replika.** A forgalom ~95%-a olvasás. A Prisma `DATABASE_URL` egy
pooler mögé (PgBouncer, Neon, Supabase) mutathat, a `DIRECT_DATABASE_URL` pedig
a migrációkhoz marad direkt.

**4. Elosztott keresőmotor.** A teljes szöveges keresés már megvan
(`prisma/sql/04-fulltext.sql` + `src/features/search/fts.ts`), és a trigram
egyezés *mellett* fut, nem helyette — a kettő ellentétes irányban hibázik. Ha a
katalógus akkorára nő, hogy ez sem elég, a következő lépcső egy külön
keresőszolgáltatás (Meilisearch, Typesense); addig egy Postgres-en kívüli
komponens csak üzemeltetni való.

**5. Háttérsorok.** Az értesítési fan-out jelenleg detached promise. Nagyságrendi
növekedésnél ez egy job queue-ba kerül (BullMQ a már meglévő Redis fölött), a
`notifyNewEpisode()` interfész változatlanul.

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
saját megoldás). A feature-rétegen nem változtat semmit: az adatbázisban már ott
van a `titleRomaji`, `titleEnglish` és `titleNative` mező, tehát a katalógus
adatai eleve többnyelvűek — csak a felület szövegei nem.

---

## Hibakezelés

Három szint, három viselkedéssel:

| Szint | Hol | Mit tesz |
| --- | --- | --- |
| `AppError` taxonómia | `src/shared/lib/errors.ts` | Minden várt hiba tipizált; a 4xx üzenete a felhasználónak szól, az 5xx-é soha nem hagyja el a szervert |
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

A szétválasztás, amire szükség van, **logikai**, és megvan: a feature-ök nem
tudnak a HTTP-ről, a route-ok nem tudnak a Prismáról, a `shared` és az
`infrastructure` nem tud a domainekről. Ha egyszer valóban külön szolgáltatás
kell, a feature-réteg változatlanul kiemelhető.
