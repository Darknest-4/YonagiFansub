# Adatmodell

Forrás: [`prisma/schema.prisma`](../prisma/schema.prisma) — 27 modell, öt
csoportban.

## Konvenciók

- **`cuid()` elsődleges kulcs.** Nagyjából rendezhető, biztonságosan
  megjeleníthető URL-ben, és nem enumerálható végig (szemben az inkrementális
  egész azonosítóval, ami elárulja, hány rekord van, és lehetővé teszi a
  szomszédok végigpróbálását).
- **`createdAt` / `updatedAt`** minden módosítható entitáson.
- **`deletedAt` (soft delete)** ott, ahol a rekordra előzmény vagy nyilvános URL
  hivatkozik: felhasználók, projektek, epizódok, kiadások, hírek, csapattagok.
  Minden más kemény törléssel megy; a nyomot az audit napló őrzi.
- **Explicit index** minden olyan oszlopon, amire szűrünk, rendezünk vagy
  joinolunk. Nincs „majd kiderül, ha lassú".
- **`BigInt` a fájlméretre.** Egy 1080p-s batch simán túllépi a 2 GB-ot; egy
  `Int` oszlop itt csendben túlcsordulna.
- **`Decimal(6,2)` az epizódszámra.** A 12.5-ös recap létező jelenség, és így
  adatbázis-szinten helyesen rendeződik.

---

## 1. Identitás és hozzáférés

```
User ──► Role ──► RolePermission ──► Permission
 │
 ├─► Session                (opak token, csak lenyomat tárolva)
 ├─► PasswordResetToken     (egyszer használatos, lejáró)
 └─► EmailVerificationToken
```

**Miért adat a jogosultság, és nem enum?** Mert a csapat összetétele változik,
és egy „a formázó mostantól publikálhat is" döntéshez nem kell deploy. A
`Permission.key` viszont a kódban is deklarálva van (`src/lib/auth/permissions.ts`),
így a hívási helyeket a TypeScript ellenőrzi — a seed a kettőt összehangolja.

**A `Role.rank` a privilégium-eszkaláció elleni védelem.** Alacsonyabb szám =
erősebb szerepkör. Egy szereplő csak nála szigorúan gyengébb szerepkörre hathat.

**A `Session` sosem tárol használható tokent.** Az oszlop `tokenHash`, és
egyedi — a keresés a lenyomatra megy, a nyers érték csak a sütiben létezik. Az
`absoluteEnd` a csúszó lejárat plafonja.

---

## 2. Katalógus

```
Project ─┬─► ProjectGenre ──► Genre
         ├─► ProjectStaff ──► TeamMember, Position
         ├─► Episode ──► Release ──► DownloadLink ──► StorageHost
         │                    │
         │                    └──► DownloadEvent
         ├─► Favorite ──► User
         └─► Comment
```

**Az `Episode` munkafolyamat-mezői külön oszlopok**, nem JSON:

```
progressTranslation  progressTiming  progressTypesetting
progressEditing      progressEncoding  progressQc
```

Ez az oldal legtöbbet nézett információja, és szűrni is akarunk rá („mi van
QC-ben?"). Egy JSON blob mindkettőt megnehezítené. Az értéktartományt
adatbázis-szintű check megszorítás védi (`prisma/sql/03-constraints.sql`).

**A `Release` elválik az `Episode`-tól**, mert egy epizódhoz több kiadás
tartozik: 1080p soft, 720p hardsub, és a v2 javított verzió. A batch kiadásnak
pedig egyáltalán nincs epizódja (`episodeId` nullable). Az egyediség
`(episodeId, formatId, resolution, version)` — ez teszi lehetetlenné, hogy
véletlenül kétszer töltsük fel ugyanazt.

**A `DownloadLink.url` sosem kerül a HTML-be.** A kliens a
`/api/v1/downloads/:id/resolve` végpontot hívja, ami rögzíti az eseményt és
átirányít. Két haszna: pontos statisztika, és egy halott tükör központi
cseréje anélkül, hogy bárkinek elavult közvetlen linkje maradna.

**A `StorageHost` külön entitás**, mert egy tárhely meghalhat. Ha a Mega ma
leáll, egy sor átállításával minden rá mutató link `OFFLINE`-ra kerül az egész
oldalon.

**A `DownloadEvent` soronként egy letöltés.** Ez adja a trend-diagramot és a
toplistát. Az IP itt is csak sózott lenyomat, és a sorokat a retenciós job
12 hónap után törli.

---

## 3. Csapat

```
TeamMember ─┬─► TeamMemberPosition ──► Position
            └─► ProjectStaff ──► Project, Position

TeamMember ──(opcionálisan)──► User
```

A csapattag és a felhasználói fiók **két külön dolog**. Egy visszavonult tag
profilja megmarad (nincs fiókja), egy regisztrált látogató pedig nem csapattag.
A `userId` nullable és egyedi.

A `TeamMemberPosition.isPrimary` vezérli a nyilvános oldal csoportosítását:
mindenki az elsődleges pozíciója alatt jelenik meg, mert „ki csinálja a
formázást?" a valódi kérdés, nem az ábécérend.

A `ProjectStaff` a stáblista: ki, melyik projekten, milyen szerepben.

---

## 4. Szerkesztőség

```
NewsPost ──► NewsCategory, User (szerző)
Comment ──► User, és pontosan egy cél: Project | Episode | NewsPost
FaqEntry
```

**A `Comment` polimorf, de valódi idegen kulcsokkal.** Három nullable FK
(`projectId`, `episodeId`, `newsPostId`), amiből pontosan egy lehet kitöltve.
Az invariánst az alkalmazás *és* egy adatbázis-szintű check megszorítás is
őrzi:

```sql
CHECK ((("projectId" IS NOT NULL)::int
      + ("episodeId" IS NOT NULL)::int
      + ("newsPostId" IS NOT NULL)::int) = 1)
```

A gyakori alternatíva (`targetType` + `targetId`) egyszerűbbnek látszik, de
elveszíti az idegen kulcsokat és a kaszkádot — egy törölt projekt árva
hozzászólásokat hagyna maga után.

---

## 5. Kommunikáció és üzemeltetés

```
ContactMessage ──► User (kezelő)
Notification ──► User
AuditLog ──► User (opcionálisan; a címke denormalizálva)
SiteSetting
MediaAsset
```

**Az `AuditLog` csak hozzáfűzhető.** Nincs a kódban út, ami módosítaná vagy
törölné (a retenciós jobon kívül). Az `actorLabel` denormalizált, hogy a nyom a
fiók törlése után is olvasható maradjon — enélkül a legfontosabb bejegyzések
válnának névtelenné pont akkor, amikor számítanának.

A `diff` mezőben csak a **ténylegesen változott** mezők vannak, redaktálva.
Teljes pillanatképek tárolása felfújná a táblát és elrejtené a lényeget.

**A `SiteSetting` kulcs-érték JSON-nal**, csoportosítva. Az `isPublic` dönti el,
hogy egy érték eljuthat-e a böngészőig. Az admin panel teljes egészében a
kódbeli deklarációkból generálódik, tehát egy új beállítás egy sor.

---

## Láthatóság

Két fogalom, amit nem szabad összekeverni:

- **`publishStatus` / `status`** — szerkesztői döntés: `DRAFT`, `SCHEDULED`,
  `PUBLISHED`, `ARCHIVED`.
- **`deletedAt`** — létezik-e egyáltalán.

A nyilvános lekérdezések mindkettőt szűrik. A szűrő **egyetlen helyen** él
szolgáltatásonként (`publicProjectFilter`, `currentPublicFilter()`), így nincs
olyan lekérdezés, ami véletlenül kihagyná.

A hírek `currentPublicFilter()`-e szándékosan **függvény, nem konstans**: egy
modulszinten kiértékelt `new Date()` a process indulásakor befagyasztaná a
határt, és egy hosszan futó szerver sosem mutatná meg az ütemezett bejegyzéseket.

---

## Indexek

A Prisma sémában deklarált indexeken felül (minden szűrő- és rendezési oszlop)
három nyers SQL kiegészítés:

**Trigram indexek** (`prisma/sql/02-search-indexes.sql`) a címoszlopokon. Ezek
teszik gyorssá az `ILIKE '%kifejezés%'`-t, amin a keresés áll. Enélkül minden
keresés teljes tábla-olvasás lenne.

**Parciális indexek** a nyilvános feedekre:

```sql
CREATE INDEX releases_public_feed_idx ON releases ("releasedAt" DESC)
  WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL;
```

Az oldal legforgalmasabb lekérdezése csak publikált sorokat olvas, tehát csak
azokat indexeljük. Töredék méret, ugyanaz a haszon.

**Check megszorítások** (`03-constraints.sql`) azokra az invariánsokra, amiket a
Prisma nem tud kifejezni. Az alkalmazás is ellenőrzi őket — de az adatbázis az,
ahol egy invariáns túlél egy hibát, egy rossz migrációt vagy egy kézi `UPDATE`-et.
