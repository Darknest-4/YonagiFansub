<div align="center">

# 夜凪 · Yonagi Fansub

**Teljes értékű platform egy magyar anime fansub csapatnak** — nyilvános oldal,
API, adminisztrációs rendszer és kiadáskezelés egy kódbázisban.

</div>

---

## Mi ez?

Nem egy weboldal, hanem egy termék. Egy fansub csapat munkájának minden része
megjelenik benne: mit fordítanak éppen, hol tart, mi jelent meg, ki csinálta,
és hogyan lehet letölteni.

A rendszer három felületre bomlik, egy kódbázisban:

| Felület | Kinek | Mit tud |
| --- | --- | --- |
| **Nyilvános oldal** | Látogatók | Katalógus, epizódok valós munkafolyamat-állapottal, kiadások letöltési tükrökkel, hírek, csapat, keresés |
| **Fiók** | Regisztrált tagok | Projektkövetés, értesítések, beállítások, aktív munkamenetek |
| **Admin** | Csapat | Projekt-, epizód-, kiadás-, hír- és csapatkezelés, médiatár, felhasználók, szerepkörök, statisztika, audit napló |

---

## Gyors indulás

```bash
# 1. Függőségek
npm install

# 2. Környezet
cp .env.example .env.local
#    Kötelezően állítsd be:
#      DATABASE_URL   – PostgreSQL 16+
#      AUTH_SECRET    – openssl rand -base64 48

# 3. Adatbázis
npm run db:push                                   # séma
npm run db:sql                                    # kiterjesztések, trigram indexek, CHECK-ek
npm run db:seed                                   # szerepkörök + demó tartalom

# 4. Indítás
npm run dev
```

A seed a végén kiírja a tulajdonosi fiók jelszavát — **csak egyszer**. Ha inkább
te adod meg: `SEED_OWNER_PASSWORD=... npm run db:seed`.

Renderre a `render.yaml` blueprinttel megy ki (Postgres, web service, napi
cron, lemez a feltöltéseknek) — részletek a
[deployment.md](docs/deployment.md)-ben.

Dockerrel, egy paranccsal:

```bash
AUTH_SECRET=$(openssl rand -base64 48) POSTGRES_PASSWORD=$(openssl rand -hex 16) \
  docker compose up -d
docker compose --profile tools run --rm migrate
```

---

## Technológiai döntések

Minden választás mögött egy indok áll, nem a népszerűség.

**Next.js 15 (App Router) + TypeScript.** A tartalom java statikusan
generálható, de a munkafolyamat-állapotoknak frissnek kell lenniük — a React
Server Components pontosan ezt a keveréket kezeli jól. Egy deploy egység
frontend + backend helyett kettő helyett: egy önkéntes csapat nem tart fenn két
szolgáltatást.

**PostgreSQL + Prisma.** A domain erősen relációs (projekt → epizód → kiadás →
link → letöltési esemény), és a lekérdezések nagy része join. A Prisma a
séma-migrációt és a típusbiztos lekérdezéseket adja; ahol nem elég (trigram
indexek, check megszorítások), ott nyers SQL egészíti ki — nem kerülgetjük.

**Nincs külön API szolgáltatás.** A Next route handlerek adják a REST API-t
`/api/v1` alatt. A nyilvános oldal szerver-komponensei közvetlenül a
service rétegből olvasnak (egy hálózati ugrás megspórolva), a böngésző és
bármely külső kliens ugyanazokon a végpontokon keresztül éri el ugyanazt.

**Saját auth, nem NextAuth.** Adatbázis-alapú, opak session token; a cookie-ban
256 bit véletlen, az adatbázisban csak a SHA-256 lenyomata. Így egy
adatbázis-szivárgás nem visszajátszható, és a kiléptetés azonnali. A NextAuth
ennél többet ad, mint amennyire szükségünk van, és kevesebb kontrollt a
munkamenet élettartama fölött.

**scrypt, nem bcrypt vagy argon2.** Memóriaigényes, a Node core-jában van,
nincs natív fordítás és nincs supply chain kockázat. A költségparaméterek a
hash stringbe kerülnek, így később emelhetők — a `needsRehash()` a belépéskor
csendben újrahasheli a régieket.

**Saját markdown renderer.** Nem `marked` + sanitizer. A bemenet előbb
escape-elődik, és csak az a HTML kerül a kimenetbe, amit maga a renderer ír ki
— nincs olyan kódút, ami szerzői HTML-t átengedne. Egy kompromittált szerkesztői
fiók így sem tud scriptet injektálni.

**Saját médiatár, SDK nélkül.** A feltöltött kép típusát a magic byte-jai
döntik el, nem a `Content-Type`; a tárolási kulcs a tartalom SHA-256 lenyomata,
így ugyanaz a fájl nem duplázódik és a URL örökre cache-elhető. A tároló driver
mögötti S3 hívások kézzel aláírt SigV4 kérések `fetch`-csel — az AWS SDK egy
nagy függőségi fát hozna két HTTP hívásért. Az aláírókulcs-származtatás az AWS
dokumentációjában publikált vektorra van tesztelve.

**Tailwind CSS v4, CSS-first konfigurációval.** A design tokenek egyetlen CSS
fájlban élnek (`src/styles/globals.css`), három rétegben: paletta → szemantikus
→ komponens. Márkaváltás egy fájl átírása.

---

## Architektúra dióhéjban

```
Böngésző
   │
   ├─ RSC oldalak ──────────► src/server/*      (olvasás, cache-elve tag alapján)
   │                              │
   └─ fetch /api/v1/* ──────► defineRoute()     (rate limit → CSRF → auth →
                                  │              validáció → handler → boríték)
                                  │
                            src/server/admin/*  (írás + audit + cache invalidálás)
                                  │
                              Prisma ──► PostgreSQL
```

Az `src/lib/api/handler.ts` a rendszer legfontosabb fájlja: minden végpont rajta
keresztül van definiálva, így egyetlen endpoint sem kerülhet ki rate limit
nélkül vagy validálatlan bemenettel.

Részletek: [`docs/architecture.md`](docs/architecture.md).

---

## Dokumentáció

| Dokumentum | Miről szól |
| --- | --- |
| [architecture.md](docs/architecture.md) | Rétegek, adatáramlás, cache stratégia, skálázási út |
| [data-model.md](docs/data-model.md) | Entitások, kapcsolatok, indexek, soft delete stratégia |
| [api.md](docs/api.md) | Végpontok, boríték formátum, hibakódok, lapozás |
| [design-system.md](docs/design-system.md) | Tokenek, tipográfia, komponensek, mozgás, akadálymentesség |
| [security.md](docs/security.md) | Fenyegetésmodell és a konkrét védelmek |
| [deployment.md](docs/deployment.md) | Éles üzembe helyezés lépésről lépésre |
| [runbook.md](docs/runbook.md) | Üzemeltetés, mentés, visszaállítás, incidenskezelés |

---

## Parancsok

```bash
npm run dev          # fejlesztői szerver
npm run build        # éles build
npm start            # éles szerver

npm run verify       # typecheck + lint + teszt  (ezt futtasd commit előtt)
npm run typecheck
npm run lint
npm test

npm run db:push      # séma szinkronizálás (fejlesztés)
npm run db:migrate   # migráció készítése
npm run db:deploy    # migráció alkalmazása (éles)
npm run db:sql       # trigram indexek, kiterjesztések, CHECK megszorítások
npm run db:seed      # szerepkörök, jogosultságok, törzsadat
npm run db:studio    # Prisma Studio
```

---

## Projektstruktúra

```
prisma/
  schema.prisma          27 modell: RBAC, katalógus, csapat, szerkesztőség, üzemeltetés
  seed.ts                idempotens törzsadat + fejlesztői demó tartalom
  migrations/0_init      a séma kiindulópontja (30 tábla, 74 index, 40 FK)
  sql/                   trigram indexek, check megszorítások

scripts/
  apply-sql.ts           a prisma/sql fájlok alkalmazása (npm run db:sql)

src/
  app/
    (site)/              nyilvános oldalak – magyar URL-ekkel
    (auth)/              belépés, regisztráció, jelszó-visszaállítás
    admin/               adminisztrációs felület
    api/v1/              REST API
  components/
    ui/                  14 design system primitív
    site/                nyilvános felület komponensei
    admin/               admin komponensek
    account/             fiókkezelés
  lib/
    api/                 route factory, boríték, rate limit, audit, lapozás
    auth/                jelszó, session, jogosultságok, guardok
    media/               formátum-felismerés, tároló driverek, SigV4 aláírás
    validation/          Zod sémák (kliens és szerver közösen használja)
  server/                domain szolgáltatások (olvasás)
  server/admin/          domain szolgáltatások (írás, audittal)
  styles/globals.css     a teljes design system
```

---

## Amit szándékosan nem tartalmaz

- **Videó hosting.** A platform feliratokat és linkeket kezel, fájlokat nem.
  A `DownloadLink` külső tárhelyekre mutat, és a valódi URL sosem kerül be a
  HTML-be — az API oldja fel, rögzíti az eseményt, majd átirányít.
- **Fizetés, adomány, hirdetés.** Nincs rá modell, mert nincs rá szükség.
- **Külső analitika.** Minden statisztika saját adatból jön. Nincs harmadik
  féltől származó szkript az oldalon, és a CSP-ben nincs is rá hely.

---

## Licenc és felelősség

A kódbázis a Yonagi Fansub csapatáé. A tartalomkezelő rendszer önmagában nem
tesz közzé semmilyen szerzői jogvédett anyagot; a
[jogi nyilatkozat](src/content/legal.ts) leírja, hogyan kezeljük a
jogtulajdonosi megkereséseket.
