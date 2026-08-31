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
| **Nyilvános oldal** | Látogatók | Katalógus, epizódok valós munkafolyamat-állapottal, online lejátszó, kiadások letöltési tükrökkel, hírek, hozzászólások, csapat, keresés |
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
#    Levélküldéshez (opcionális fejlesztéskor — enélkül a naplóba írja):
#      MAIL_DRIVER=resend  +  RESEND_API_KEY=re_…

# 3. Adatbázis
npm run db:push                                   # séma
npm run db:sql                                    # kiterjesztések, indexek, teljes szöveges keresés, CHECK-ek
npm run db:seed                                   # szerepkörök + demó tartalom

# 4. Indítás
npm run dev
```

**Az első regisztráló lesz a tulajdonos.** A seed szándékosan nem hoz létre
adminisztrátori fiókot: indítás után regisztrálj az oldalon, és a fiókod
megkapja a teljes jogosultságot — azonnal aktívan, e-mail-megerősítés nélkül,
tehát működő SMTP nélkül is be tudsz lépni. Minden további regisztráló a
szokásos `member` szerepkört kapja.

Zárt telepítéshez a régi viselkedés kérhető: `SEED_OWNER_PASSWORD=… npm run db:seed`
— ilyenkor a seed hozza létre a tulajdonost, és a bootstrap nem lép életbe.

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

## Így néz ki

A képek éles buildről készültek, a fejlesztői seed demó tartalmával (5 projekt,
31 epizód, 58 kiadás, 3 hír, 5 csapattag, 5 hozzászólás). Nem kézzel gyűjtött felvételek: a
`npm run screenshots` állítja elő őket azonos viewporton és azonos
adatbázis-állapotból, tehát bármikor újragenerálhatók — részletek a
[docs/screenshots/](docs/screenshots/README.md) alatt.

<details>
<summary><b>Nyilvános oldal</b> — 21 oldal</summary>

### Főoldal
![Főoldal](docs/screenshots/01-fooldal.png)

### Projektek (katalógus)
Szűrés állapot, típus, műfaj és évad szerint; a szűrők az URL-ben élnek, tehát
egy szűrt nézet linkelhető.
![Projektek](docs/screenshots/02-projektek.png)

### Projekt adatlap
A munkafolyamat állapota epizódonként — fordítás, időzítés, formázás,
lektorálás, enkódolás, QC.
![Projekt adatlap](docs/screenshots/03-projekt-reszletek.png)

### Epizód, lejátszó és letöltések
Online nézés és letöltés egy oldalon. A lejátszó forrásonként dönti el, hogyan
játssza le: saját tárhelyről MSE-n át (a videó URL-je nem jelenik meg a DOM-ban),
harmadik féltől pedig saját CSP-vel elzárt keretben.
![Epizód](docs/screenshots/04-epizod.png)

### Kiadások
![Kiadások](docs/screenshots/05-kiadasok.png)

### Hírek
![Hírek](docs/screenshots/06-hirek.png)

### Hír
Hozzászólásokkal: szálas válaszok, megerősített e-mailhez kötve, moderálható.
Ugyanez a szekció ül a projekt- és az epizódoldal alján is.
![Hír](docs/screenshots/07-hir.png)

### Csapat
![Csapat](docs/screenshots/08-csapat.png)

### Csapattag profil
![Csapattag](docs/screenshots/09-csapattag.png)

### GYIK
![GYIK](docs/screenshots/10-gyik.png)

### Kapcsolat
![Kapcsolat](docs/screenshots/11-kapcsolat.png)

### Csatlakozz
![Csatlakozz](docs/screenshots/12-csatlakozz.png)

### Keresés
![Keresés](docs/screenshots/13-kereses.png)

### Belépés
![Belépés](docs/screenshots/14-belepes.png)

### Regisztráció
![Regisztráció](docs/screenshots/15-regisztracio.png)

### Elfelejtett jelszó
![Elfelejtett jelszó](docs/screenshots/16-jelszo-visszaallitas.png)

### Adatkezelési tájékoztató
![Adatkezelés](docs/screenshots/17-adatkezeles.png)

### Felhasználási feltételek
![Felhasználási feltételek](docs/screenshots/18-felhasznalasi-feltetelek.png)

### Jogtulajdonosi megkeresés
![DMCA](docs/screenshots/19-dmca.png)

### 404 — nem található
![404](docs/screenshots/20-404.png)

### Karbantartási mód
![Karbantartás](docs/screenshots/21-karbantartas.png)

</details>

<details>
<summary><b>Fiók</b> — 4 oldal</summary>

### Profil
![Profil](docs/screenshots/30-profil.png)

### Fiókbeállítások
Jelszócsere, értesítési beállítások és az aktív munkamenetek listája —
bármelyik külön visszavonható.
![Fiókbeállítások](docs/screenshots/31-profil-beallitasok.png)

### Értesítések
![Értesítések](docs/screenshots/32-profil-ertesitesek.png)

### Követett projektek
![Kedvencek](docs/screenshots/33-profil-kedvencek.png)

</details>

<details>
<summary><b>Admin</b> — 20 oldal</summary>

### Vezérlőpult
![Vezérlőpult](docs/screenshots/40-admin-vezerlopult.png)

### Statisztika
![Statisztika](docs/screenshots/41-admin-statisztika.png)

### Projektek
![Admin projektek](docs/screenshots/42-admin-projektek.png)

### Projekt szerkesztő
Négy kártyára bontva — azonosítás, besorolás, média, publikálás. Piszkozat
automatikusan mentődik, és a mentetlen munka újratöltés után visszakérhető.
![Projekt szerkesztő](docs/screenshots/43-admin-projekt-szerkeszto.png)

### Új projekt
![Új projekt](docs/screenshots/44-admin-projekt-uj.png)

### Metaadat-import
AniList és MyAnimeList azonosítóból behúzza a címeket, a leírást, a borítót, az
epizódlistát és a kapcsolódó évadokat. A két forrás egymástól függetlenül fut:
ha az egyik nem elérhető, a másikból kapott adat akkor is beolvasható, és az
importáló megmondja, melyik nem válaszolt.
![Metaadat-import](docs/screenshots/44b-admin-metaadat-import.png)

### Kiadások
![Admin kiadások](docs/screenshots/45-admin-kiadasok.png)

### Új kiadás
Felbontás, kodek, konténer, fájlméret, ellenőrzőösszeg és több letöltési tükör.
![Új kiadás](docs/screenshots/46-admin-kiadas-uj.png)

### Hírek
![Admin hírek](docs/screenshots/47-admin-hirek.png)

### Hír szerkesztő
Írás/előnézet lapokkal; az előnézet ugyanazzal a rendererrel készül, amivel a
nyilvános oldal — tehát amit a szerző lát, az megy ki.
![Hír szerkesztő](docs/screenshots/48-admin-hir-szerkeszto.png)

### Csapat
![Admin csapat](docs/screenshots/49-admin-csapat.png)

### Médiatár
Fogd-és-vidd feltöltés, mappák, keresés. Ugyanez a komponens nyílik modálban
képválasztóként a projekt- és híradatlapon.
![Médiatár](docs/screenshots/50-admin-mediatar.png)

### GYIK kezelés
![GYIK kezelés](docs/screenshots/51-admin-gyik.png)

### Kapcsolati üzenetek
![Üzenetek](docs/screenshots/52-admin-uzenetek.png)

### Hozzászólás-moderálás
![Hozzászólások](docs/screenshots/53-admin-hozzaszolasok.png)

### Felhasználók
![Felhasználók](docs/screenshots/54-admin-felhasznalok.png)

### Szerepkörök és jogosultságok
30 jogosultság, 6 rendszerszerepkör. A mátrix mutatja, melyik szerepkör mit tud.
![Szerepkörök](docs/screenshots/55-admin-szerepkorok.png)

### Beállítások
![Beállítások](docs/screenshots/56-admin-beallitasok.png)

### Audit napló
Minden admin írás mezőnkénti diff-fel. A tábla csak bővül: a kódban nincs olyan
út, ami módosítaná vagy törölné.
![Audit napló](docs/screenshots/57-admin-naplo.png)

### Videó-szolgáltatók
Egy új filehost vagy videómegosztó felvétele egy sor a felületen, nem kódmódosítás:
a beágyazási sablon, a felismerő URL-minták és az engedélyezett domainek adják meg,
mit fogadunk el és hová engedjük a keretet. Ha egy tárhely elromlik, egy kapcsolóval
kikapcsolható, és minden hozzá tartozó forrás azonnal kiesik a lejátszásból.
![Videó-szolgáltatók](docs/screenshots/58-admin-videoszolgaltatok.png)

</details>

<details>
<summary><b>Mobil</b> — 390 × 844</summary>

A mobil nem összenyomott asztali nézet: a navigáció, a szűrők és a táblázatok
külön elrendezést kapnak. Ezek az oldalak azok, ahol a különbség érdemi.

### Főoldal
![Főoldal mobilon](docs/screenshots/01-fooldal-mobil.png)

### Projektek
![Projektek mobilon](docs/screenshots/02-projektek-mobil.png)

### Projekt adatlap
![Projekt adatlap mobilon](docs/screenshots/03-projekt-reszletek-mobil.png)

### Kiadások
![Kiadások mobilon](docs/screenshots/05-kiadasok-mobil.png)

### Epizód és lejátszó
![Epizód mobilon](docs/screenshots/04-epizod-mobil.png)

### Admin vezérlőpult
![Admin mobilon](docs/screenshots/40-admin-vezerlopult-mobil.png)

### Admin csapat
![Admin csapat mobilon](docs/screenshots/49-admin-csapat-mobil.png)

### Admin felhasználók
![Admin felhasználók mobilon](docs/screenshots/54-admin-felhasznalok-mobil.png)

</details>

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

**Resend a levelekhez, nem SMTP.** Egy HTTP API-hívás levelenként: nincs hozzá
külön csomag, nincs nyitva tartott kapcsolat, és nem kell a 25/587-es port —
amit egy PaaS gyakran zár. Az ingyenes csomag másodpercenként két kérést enged,
ezért a meghajtó sorba állítja a küldést; enélkül egy ötvenes értesítés-köteg
két elfogadott és negyvennyolc eldobott levél lenne, csendben. Az SMTP továbbra
is választható egy env változóval.

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
npm test             # egységtesztek — nem kell hozzá adatbázis

# Integrációs tesztek: valódi Postgres ellen futnak, és ürítik a táblákat.
# Ezért külön változót olvasnak (soha nem a DATABASE_URL-t), és a névben
# szerepelnie kell a "test" szónak — enélkül elutasítják a futást.
createdb yonagi_test
TEST_DATABASE_URL=postgresql://yonagi:yonagi@localhost:5432/yonagi_test \
  npm run test:integration

npm run db:push      # séma szinkronizálás (fejlesztés)
npm run db:migrate   # migráció készítése
npm run db:deploy    # migráció alkalmazása (éles)
npm run db:sql       # kiterjesztések, trigram + teljes szöveges indexek, CHECK megszorítások
npm run db:seed      # szerepkörök, jogosultságok, törzsadat
npm run db:studio    # Prisma Studio

npm run hls -- --input ep01.mkv --key video/projekt/01
                     # HLS-csomagolás + feltöltés online nézéshez (ffmpeg kell)
npm run smoke        # böngészős füstpróba futó szerver ellen
npm run screenshots  # docs/screenshots/ újragenerálása
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
