# Biztonság

Ez a dokumentum azt írja le, mi ellen véd a rendszer és hogyan. Nem
felsorolás — minden pont mögött ott van, hogy hol van a kódban, és miért így.

---

## Fenyegetésmodell

Egy fansub oldal reális támadói, csökkenő valószínűség szerint:

1. **Automatizált szkennerek.** Ismert sebezhetőségeket, nyitott admin
   felületeket, alapértelmezett jelszavakat keresnek. Ez a forgalom napi szintű.
2. **Spam- és scrape-botok.** Kapcsolati űrlap, regisztráció, hozzászólás,
   valamint a letöltési linkek tömeges begyűjtése.
3. **Fiókátvétel.** Jelszó-újrafelhasználás más oldalakról (credential
   stuffing), és célzott brute force egy ismert admin felhasználónévre.
4. **Belső hiba vagy kompromittált stábfiók.** Egy szerkesztőnek van írási joga
   a nyilvános tartalomhoz. Ha a fiókja elveszik, a kár mértéke a kérdés.
5. **Jogi nyomás.** Nem technikai támadás, de kezelendő: a jogtulajdonosi
   megkeresésnek van egy jól látható útja és egy vállalt válaszideje.

Amivel **nem** számolunk: célzott APT, oldalcsatornás támadás, fizikai
hozzáférés a szerverhez. Ezek ellen egy önkéntes projekt nem tud érdemben
védekezni, és nem is reális fenyegetés ebben a kontextusban.

---

## Jelszavak

**Hol:** `src/lib/auth/password.ts`, `src/lib/auth/password-policy.ts`

- **scrypt**, N=2¹⁵, r=8, p=1, egyedi 16 bájtos sóval, 64 bájtos kimenettel.
  Memóriaigényes, tehát GPU-val nem gyorsítható lényegesen.
- A paraméterek **a hash stringbe kerülnek** (`scrypt$32768$8$1$só$kulcs`), így
  a költség később emelhető. A `needsRehash()` belépéskor észreveszi a régi
  hasheket, és csendben újrahasheli őket a felhasználó zavarása nélkül.
- A megadott jelszó **NFKC-normalizált**, mielőtt hashelnénk. Enélkül egy
  `é` (U+00E9) és egy `e + ´` (U+0065 U+0301) — vizuálisan azonos — nem
  egyezne, és a felhasználó nem tudná, miért.
- Az összehasonlítás `timingSafeEqual`.
- Tampered hash esetén (pl. abszurd N) a verifikáció `false`-t ad, nem próbál
  gigabájtokat allokálni.

**Miért nem argon2id?** Az argon2id ma az ajánlott algoritmus, és a
`verifyPassword` úgy van megírva, hogy egy `argon2id$…` ág hozzáadható legyen.
A scrypt viszont a Node core-jában van: nincs natív fordítás, nincs
supply-chain kockázat, és egy önkéntes csapatnál a „nem tudom telepíteni"
nagyobb reális kockázat, mint a két algoritmus közti különbség.

**Házirend.** Ugyanaz a függvény fut a böngészőben (élő erősségjelző) és a
szerveren (mérvadó ellenőrzés), mert egy közös, szerver-mentes modulban él. Így
a felület nem tud olyan jelszót ígérni, amit az API elutasít.

---

## Munkamenet

**Hol:** `src/lib/auth/session.ts`, `src/lib/auth/tokens.ts`

- A süti **256 bit véletlent** hordoz; az adatbázisban csak a **SHA-256
  lenyomata** van. Egy adatbázis-szivárgás nem visszajátszható.
- `httpOnly`, `secure`, `SameSite=Lax`, élesben `__Host-` prefixszel — az
  utóbbi origin-höz köti a sütit, és megakadályozza, hogy egy aldomain
  felülírja.
- **Csúszó lejárat abszolút plafonnal**: minden használat meghosszabbítja, de
  soha nem az `absoluteEnd` fölé. Egy örökké nyitva hagyott tab nem jelent
  örök munkamenetet.
- A `getSession()` React `cache()`-elt: egy oldal tizenöt szerver komponense
  is egyetlen lekérdezést jelent.
- Minden kérésnél újraellenőrizzük a felhasználó állapotát. Egy kitiltott fiók
  munkamenete **azonnal** érvénytelen, nem a süti lejáratakor.
- Jelszócsere az összes többi munkamenetet visszavonja; a felfüggesztés és a
  kitiltás mindet.

---

## CSRF

**Hol:** `src/middleware.ts`, `src/lib/api/handler.ts`

Kettős védelem minden állapotmódosító kérésnél:

1. **Aláírt token, double-submit mintával.** A middleware kiad egy
   JavaScriptből olvasható sütit (`nonce.HMAC`); a kliens átmásolja az
   `X-CSRF-Token` fejlécbe; a szerver összeveti a kettőt *és* ellenőrzi az
   aláírást. Idegen oldal nem tudja kiolvasni a sütit (same-origin policy), és
   nem tud érvényes tokent gyártani (nincs meg a titka).
2. **Origin/Host egyezés.** A `Origin` fejlécnek a kérés `Host`-jával vagy a
   konfigurált origin-nel kell egyeznie.

A `SameSite=Lax` már önmagában blokkolja a klasszikus form-post támadást; ez a
két réteg a maradékot fedi (Lax átengedi a top-level GET navigációt, és a régi
böngészők nem ismerik).

---

## Jogosultságok

**Hol:** `src/lib/auth/permissions.ts`, `src/server/admin/users.ts`

- **Jogosultság-alapú, nem szerepkör-alapú.** A kód sosem azt kérdezi, hogy
  „admin-e", hanem hogy „van-e `project:write` joga". A szerepkör csak egy
  elnevezett csomag.
- A mátrix **adat, nem kód**: a csapat deploy nélkül hangolhatja. A kulcsokat
  viszont a kód deklarálja, így a hívási helyeket a TypeScript ellenőrzi, és a
  seed kipucolja a már nem létező jogosultságokat.
- **Rangsor a privilégium-eszkaláció ellen.** Minden szerepkörnek van rangja
  (alacsonyabb = erősebb). Egy szereplő csak nála **szigorúan gyengébb**
  szerepkörre hathat. Enélkül egy adminisztrátor egyetlen kéréssel tulajdonossá
  tehetné magát.
- **Nincs önmódosítás.** Saját szerepkört és státuszt senki nem módosíthat: ez
  a leggyakoribb út odáig, hogy egy rendszerben nulla adminisztrátor maradjon.
- **Az utolsó tulajdonos védett.** A rendszer mindig hagy legalább egy fiókot,
  amelyik tud jogosultságot adni.
- **A tulajdonosi szerepkör nem szerkeszthető.** Ez a védőháló: enélkül egy
  hibás mentés kizárhatná a csapatot.

Az admin oldalsáv szűri magát a jogosultságok szerint, de ez **kényelmi
funkció, nem hozzáférés-vezérlés** — minden oldal és minden végpont önállóan
ellenőriz.

**Publikálási jogosultság.** A `project:publish`, `release:publish` és
`news:publish` ellenőrzése az írási szolgáltatásban van
(`assertPublishAllowed`), nem csak a dedikált publikáló végponton. Ha csak ott
lenne, a védelem nulla értékű volna: a szerkesztő űrlap tartalmaz státusz
mezőt, tehát egy `*:write` jogú felhasználó a legördülőből publikálhatna. A
visszavonás ugyanígy gátolt — egy már kiadott oldal levétele legalább akkora
döntés, mint a kiadása.

---

**Az első fiók (bootstrap).** Üres telepítésen az első regisztráció megkapja a
tulajdonosi szerepkört, azonnal aktív és megerősített fiókkal. A számlálás és a
beszúrás egyetlen `SERIALIZABLE` tranzakcióban fut, tehát két egyidejű
regisztrációból sem lehet két tulajdonos. Az esemény `PERMISSION_CHANGE`
bejegyzést kap az audit naplóban és külön `warn` sort a szerver logban — utóbbi
azért, mert az audit tábla nyesését a napi job végzi, a logot viszont a
gyűjtő megőrzi.

A kockázat vállalt és körülhatárolt: a telepítés és az első regisztráció közti
ablakban bárki tulajdonossá válhat, aki eléri az oldalt. Ez ugyanaz a
bootstrap-minta, amit a Gitea, a Grafana és sok más önhosztolt rendszer használ;
az ablakot az zárja be, hogy a deploy után azonnal regisztrálsz. Zárt
telepítéshez a `SEED_OWNER_PASSWORD` megadásával a seed hozza létre a
tulajdonost, és a bootstrap nem lép életbe.

---

## Bemenet és kimenet

**Bemenet.** Minden végpont Zod sémával validál, a `defineRoute`-on keresztül.
Ugyanaz a séma fut a kliens űrlapon. A törzs 512 KB-ban van maximálva,
`application/json` kötelező.

**SQL.** Kizárólag Prisma paraméterezett lekérdezések. A két nyers `$queryRaw`
(letöltési trend) is paraméterezett tagged template. **A rendezés allow-listás**
— ez a fő nem-nyilvánvaló injekciós felület egy ORM mellett, mert a `sort` mező
egyenesen az `orderBy`-ba kerülne.

**Kimenet (XSS).** A React alapból escape-el. Az egyetlen `dangerouslySetInnerHTML`
a markdown renderelés, ami **konstrukció szerint biztonságos**: a bemenet előbb
escape-elődik, és csak az a HTML kerül a kimenetbe, amit maga a renderer ír ki.
Nincs olyan kódút, ami szerzői HTML-t átengedne — tehát nincs mit sanitizálni és
nincs mit elrontani egy sanitizer konfigurációban.

A linkeknél allow-lista: `http(s)`, `mailto`, horgony és oldalon belüli útvonal.
A `javascript:` és `data:` sémák eldobódnak, a címke sima szövegként marad.

**Fájlfeltöltés.** A feltöltött bájtok az egyetlen olyan felhasználói tartalom,
ami a saját eredetünkről jön vissza, ezért itt semmit nem hiszünk el a kérésnek:

- A típust a **magic byte-ok** döntik el (`lib/media/image.ts`), nem a
  `Content-Type` és nem a fájlnév. Öt képformátum fogadható; egy `.png`-nek
  nevezett HTML vagy zip elutasításra kerül.
- **SVG nincs az allow-listán.** Legitim képformátum és egyben script-futtatási
  környezet: egy `onload`-os `<svg>` a saját domainünkről tárolt XSS lenne.
  Biztonságos elfogadása sanitizert vagy külön asset-origint igényelne — egyik
  sem ingyenes, és egyik sem kell borítóképhez.
- A **kulcsot mi generáljuk** a tartalom SHA-256 lenyomatából. A feltöltő nem
  választhatja meg, hova kerül a fájl, és a kulcs nem tartalmaz semmit a
  beküldött névből.
- A kiszolgáló útvonal (`/uploads/[...path]`) csak az allow-listás
  kiterjesztéseket adja ki, mindig **explicit `Content-Type`-pal**, `nosniff`-fel
  és `default-src 'none'; sandbox` CSP-vel — így egy elgépelt típusú válasz sem
  válhat aktív dokumentummá. A path traversal ellen a *feloldott* útvonal
  prefix-ellenőrzése véd, nem a szegmensek szűrése.
- Méretkorlát 8 MB, kétszer ellenőrizve: a `Content-Length` állítás olcsón
  elutasítható a bájtok beolvasása előtt, a puffer hossza pedig a tény.

**Nyílt átirányítás.** A `?next=` paraméter a `safeRedirectPath()`-en megy át,
ami csak azonos eredetű relatív útvonalat enged. Enélkül a belépőoldal
adathalász eszközzé válna, ami a valódi domainen indul.

---

## Fejlécek

**Hol:** a legtöbb a `next.config.ts`-ben, a **CSP viszont a
`src/middleware.ts`-ben** — mert kérésenkénti nonce-t hordoz, amire egy statikus
fejléc képtelen.

> **Amit ez a projekt megtanult.** A CSP-ből eredetileg **hiányzott a
> `script-src`**, így a `default-src 'self'` vonatkozott a scriptekre is, és a
> böngésző minden beágyazott scriptet blokkolt. A React streamelő SSR-je viszont
> pont beágyazott scriptekkel emeli a helyükre a `<template>`-ekben érkező
> tartalmat: blokkolva a HTML hiánytalanul megérkezett (100 kB), a
> **megjelenített oldal pedig üres maradt**. Minden útvonal 200-at adott,
> miközben minden böngészőben fekete képernyő volt — és minden `curl`-alapú
> ellenőrzés zöld volt, mert a curl nem futtat scriptet.
>
> Ezért van a `scripts/smoke.mjs`, és ezért fut a CI-ben: valódi böngészőben
> nyitja meg az oldalakat, és a **látható szöveget**, a `<main>` méretét és a
> konzolt nézi, nem a státuszkódot.

| Fejléc | Érték |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'` |
| `Strict-Transport-Security` | 2 év, `includeSubDomains`, `preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | kamera, mikrofon, geolokáció, fizetés tiltva |
| `Cross-Origin-Opener-Policy` | `same-origin` |

A `script-src` felépítése: `'self' 'nonce-<kérésenkénti>' 'strict-dynamic'`. A
nonce-ot a middleware generálja, és a **kérés** fejlécére is ráteszi — a Next
onnan olvassa ki, és azzal bélyegzi meg a saját script tagjeit. Csak a válaszra
téve a Next scriptjei nonce nélkül maradnának, tehát blokkolódnának. A
`'strict-dynamic'` engedi, hogy a nonce-olt bootstrap betöltse a Next chunkjait,
anélkül hogy egyenként fel kellene sorolni őket.

A CSP `connect-src 'self'` — nincs harmadik féltől származó kapcsolat, mert
nincs is analitika vagy hirdetés az oldalon. A `style-src` `'unsafe-inline'`-t
tartalmaz, amit a Next kritikus CSS-e és a framer-motion megkövetel; a
`script-src` **nem** — ott a nonce a védelem.

A `font-src` és a `style-src` **nem** engedi a `fonts.gstatic.com`-ot és a
`fonts.googleapis.com`-ot. A betűtípusok `next/font/google`-lel jönnek, ami
build időben letölti a fájlokat és a `/_next/static/media`-ból szolgálja ki
őket — a böngésző soha nem fordul harmadik félhez. Ez a built kimeneten
ellenőrizve van, nem feltételezés. Olyan hosztokat felsorolni, amiket nem
használunk, pontosan az ellenkezője annak, amiért a CSP van.

A `/uploads/:path*` szigorúbb szabályt kap (`default-src 'none'; sandbox`) —
ez az egyetlen útvonal, ahol felhasználó által beküldött bájtok jönnek vissza a
saját eredetünkről.

---

## Adatvédelem

- **A nyers IP-cím sehol nem tárolódik.** Ami mentésre kerül, az a szerver
  titkával képzett HMAC-SHA256 lenyomat első 32 karaktere. Ez elég a
  rate limitinghez és a visszaélés-vizsgálathoz, de más telepítésen
  értelmetlen és nem visszafejthető.
- A naplózó **redaktálja** a jelszó, token, cookie és titok jellegű kulcsokat,
  mielőtt bármit kiírna.
- Az audit napló diff-je ugyanezen a redaktáláson megy át.
- A fiók törlése felszabadítja a felhasználónevet és az e-mail-címet, de
  megtartja a sort — így a hivatkozó rekordok (audit, hozzászólások) épek
  maradnak, ahelyett hogy árván maradnának vagy kaszkádolva törlődnének.
- Retenció: letöltési események 12 hónap, értesítések 90 nap,
  kapcsolati üzenetek 24 hónap, audit napló 12 hónap (a biztonsági bejegyzések
  tovább).

---

## Visszaélés elleni védelem

| Felület | Védelem |
| --- | --- |
| Belépés | 8/5 perc IP-nként **és** fiókzárolás 6 sikertelen próba után 15 percre |
| Regisztráció | 5/óra + honeypot mező |
| Kapcsolati űrlap | 3/óra + honeypot + hosszkorlátok |
| Hozzászólás | 12/10 perc + megerősített e-mail kötelező |
| Letöltés | 60/5 perc, feloldó végponton keresztül |

**Nincs fióklistázás.** A belépés, a regisztráció és a jelszó-visszaállítás
ugyanazt a választ adja létező és nem létező cím esetén. Ismeretlen e-mailnél a
`burnPasswordTime()` ugyanannyi ideig dolgozik, mint egy valódi ellenőrzés —
enélkül a válaszidő elárulná, mely címek vannak regisztrálva.

A honeypot mezőnél a válasz **sikert jelez**. Egy botnak megmondani, hogy
lebukott, csak arra tanítja, hogy legközelebb jobban próbálkozzon.

---

## Függőségi sebezhetőségek

Az `npm audit` állapota nem „nulla", hanem **indokolt**. Ami maradt, és miért:

| Csomag | Hol | Miért marad |
| --- | --- | --- |
| `postcss` | a Next saját `node_modules`-ában | A Next vendorolja; a 15.x sorban nincs újabb kiadás. Csak build időben, a saját CSS-ünkön fut — a sebezhetőség támadó által vezérelt CSS-t igényelne, ami nálunk nincs. |
| `deepmerge-ts` (a `prisma` CLI-n át) | dev/build | A Prisma CLI konfigurációs fájlt olvas vele, amit mi írunk. A `@prisma/config` legújabb kiadása is a sebezhető sorra mutat, tehát nincs hova frissíteni; `overrides`-szal ki lehetne kényszeríteni, de az a `prisma generate`-et kockáztatná — pont azt a lépést, amin a deploy áll vagy bukik. |

Egyik sem kerül be az éles image-be futásidejű kódként: a Dockerfile runner
rétege csak a `standalone` kimenetet és a Prisma klienst másolja, a CLI-t és a
build eszközöket nem.

Ami **nem** marad: a Next 15.1.6 elleni két kritikus és több magas súlyosságú
tanácsadás (cache poisoning, image optimizer cache key confusion, dev server
origin ellenőrzés hiánya) — a 15.5.24-re frissítés lezárta őket.

---

## Védett videólejátszás

A `/api/v1/watch/...` végpontok HLS-csomagot szolgálnak ki úgy, hogy a
médiatároló kulcsa sosem jut el a böngészőig.

**Amit megakadályoz:**

| Támadás | Miért nem működik |
| --- | --- |
| URL másolása a hálózati fülről, megosztás | A token a nézőhöz kötött (munkamenet/anonim süti + hálózati előtag + user agent), és ~90 mp alatt lejár |
| Egy érvényes tokennel végigmenni a szegmenseken | A token az *adott* szegmensre szól; másikra 403 |
| Beágyazás idegen oldalra | `Sec-Fetch-Site` ellenőrzés, `Cross-Origin-Resource-Policy: same-origin` |
| A proxy megkerülése az `/uploads` útvonalon | Az csak képkiterjesztéseket szolgál ki, minden más 404 |
| Könyvtárból kilépés (`../`) a kulcsban | A séma elutasítja, a playlist-átíró normalizál és gyökér fölé lépést nem enged |
| Tömeges letöltés | Nézőnként és videónként rate limit, a lejátszás és a scrapelés sebessége közé állítva |
| „Videó címének másolása" a jobb gombos menüben | A `<video>` `src`-je `blob:` URL, nincs benne médiacím |

### Harmadik féltől származó források

Három forrástípus van, és nem egyforma a védelmük — ezt érdemes tudni, mielőtt
valamit „védettnek" hiszel:

| Típus | Ki szolgálja ki | Mit rejt el |
| --- | --- | --- |
| **Saját tároló (HLS)** | Mi, aláírt tokennel | Mindent — semmilyen URL nem jut a böngészőig |
| **Külső fájl, proxyval** | Mi, aláírt tokennel | A fájl eredetét. Cserébe minden bájt a te sávszélességed |
| **Külső fájl, proxy nélkül** | A szolgáltató | Semmit — a cím látszik. Az ő védelmi szintjük érvényes |
| **Beágyazás (iframe)** | A szolgáltató | Semmit, de **izolálva** — lásd lent |

Az embed és a proxy nélküli fájl nem a mi kiszolgálásunk, ezért nem rejtjük el,
hanem **elszigeteljük**. A szolgáltató lejátszója egy `/beagyazas/[id]` alatti,
saját domainünkön futó dokumentumban él, aminek külön CSP-je van, és az pontosan
azt az egy hosztot nevezi meg, amit az adott forrás bejelentett. Ennek két
következménye van:

- **Új szolgáltató nem igényel deployt.** Az oldal `frame-src` direktívája
  `'self'` marad örökre; a bővítés egy eldobható keretben történik.
- **Egy feltört szolgáltató semmit nem ér el nálunk.** Abban a keretben nincs
  munkamenet, nincs oldalscript, és a CSP `script-src 'none'` — még ha akarna,
  se tudna semmit lekérni.

A sandbox alapból nem engedi a felugró ablakokat és azt, hogy a keret kirángassa
a látogatót az oldalról. Néhány makacs host eltörik ettől; azoknál forrásonként
lazítható.

### A proxy és a belső hálózat

A „szerveren keresztül kiszolgálva" kapcsoló egy olyan URL-t kér le, amit egy
stábtag írt be. Védelem nélkül ez azt jelentené, hogy egy `episode:write` jogú
szerkesztő **bármit elolvashat, amit a szerver elér** — felhő-metaadatot, belső
admin felületet, adatbázis HTTP-portját.

Ezért minden kimenő kapcsolat előtt ellenőrizzük a cél **IP-címét**, nem a
hosztnevet:

- IP-literálok (`https://169.254.169.254/`) a kérés előtt elbuknak
- Hosztnevek a DNS-feloldás után, a `lookup` hookban — így a socket meg sem
  nyílik, és nincs rés, ahol a DNS másodszorra mást válaszolhatna
- Az átirányításokat nem követjük: egy 302 kilépés lenne az imént ellenőrzött
  címtartományból

Tiltott: loopback, link-local (metaadat!), RFC1918, CGNAT, multicast, a
fenntartott és dokumentációs tartományok, valamint ugyanezek IPv6-ba csomagolt
alakja (`::ffff:127.0.0.1`).

**Karbantartási figyelmeztetés:** ha egy szolgáltató `domains` listájából
kikerül egy hoszt, az azon futó források nem fognak lejátszani — a keret CSP-je
onnantól nem engedi. Ez szándékos, de a hibakép „a szolgáltató nem megy", ezért
érdemes először itt keresni.

**Amit NEM akadályoz meg — és ezt fontos kimondani:**

Ha a böngésző lejátssza, a bájtok a gépen vannak. Beágyazott és proxy nélküli
forrásnál ráadásul a cím is látszik — ott a szolgáltató védelmén kívül nincs
semmink, és ezt nem is állítjuk másképp. Fejlesztői eszközökkel vagy
egy olyan bővítménnyel, ami az MSE-be köt be (nem a DOM-ot olvassa), a fájl
kinyerhető. Ezen csak valódi DRM változtat — Widevine, PlayReady, FairPlay —,
ami licencszervert és címenkénti csomagolást igényel, tehát külön projekt és
külön költség.

A cél tehát nem a lehetetlen garantálása, hanem az, hogy minden *olcsó* út
zárva legyen: aki el akarja vinni, annak dolgoznia kelljen érte, és a
véletlenül kiszivárgó link semmit ne érjen.

**Amire figyelni kell karbantartáskor:**

- Az `/uploads/[...path]` útvonal kiterjesztés-fehérlistájába **soha ne kerüljön
  be** `.ts`, `.m3u8` vagy `.m4s`. Ha bekerül, minden szegmens stabil,
  hitelesítés nélküli URL-en elérhetővé válik — és a lejátszás továbbra is
  működne, tehát semmi nem tűnne elrontottnak.
- A CSP `media-src` és `worker-src` direktívájában szükséges a `blob:`. Ha
  kikerül, a lejátszás némán elhal.

---

## Amit tudatosan nem védünk

- **A letöltési linkek scrape-elése.** Aki elég sokáig kattint, összegyűjtheti
  őket. A rate limit lassítja, a feloldó végpont pedig lehetővé teszi egy
  visszaélő tükör központi cseréjét — de a tartalom nyilvános, és nem is
  szeretnénk másképp.
- **A projektállapotok titkossága.** Nyilvános adat, ez a lényege.

---

## Incidens esetén

1. **Kompromittált stábfiók.** Admin → Felhasználók → státusz `SUSPENDED`.
   Ez azonnal érvényteleníti minden munkamenetét. Utána az audit napló
   (`/admin/naplo`) megmutatja, mihez nyúlt.
2. **Kiszivárgott `AUTH_SECRET`.** Cseréld ki, és indítsd újra. Ezzel minden
   munkamenet és minden CSRF token érvénytelenné válik — mindenki kilép, ami
   ilyenkor a helyes viselkedés.
3. **Adatbázis-szivárgás gyanúja.** A jelszavak scrypt-tel hashelve vannak, a
   munkamenet-tokenek csak lenyomatként — egyik sem közvetlenül használható.
   Ettől függetlenül: `AUTH_SECRET` csere, majd kötelező jelszócsere
   kommunikálása.

Részletes lépések: [`runbook.md`](runbook.md).
