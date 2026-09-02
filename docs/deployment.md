# Üzembe helyezés

## Amire szükség van

- **PostgreSQL 16+** — `pg_trgm` és `unaccent` kiterjesztéssel
- **Node 20.11+** (vagy Docker)
- **TLS-terminálás** — a `__Host-` prefixű sütik és a HSTS https-t követelnek
- *(opcionális)* Redis — csak több app példány esetén kötelező
- **Levélküldés** — a blueprint alapból [Resend](https://resend.com)-et használ; enélkül
  a jelszó-visszaállítás és az e-mail-megerősítés nem működik (SMTP is választható)

---

## 1. Környezet

```bash
cp .env.example .env
```

Kötelező:

```bash
NEXT_PUBLIC_SITE_URL=https://yonagifansub.hu     # https, záró / nélkül
DATABASE_URL=postgresql://…                      # poolerre mutathat
DIRECT_DATABASE_URL=postgresql://…               # migrációkhoz, direktben
AUTH_SECRET=$(openssl rand -base64 48)           # 32+ karakter
```

Az `AUTH_SECRET` egyszerre védi a munkamenet-tokeneket, a CSRF tokeneket és az
IP-lenyomatokat. **Cseréje mindenkit kiléptet** — ami kompromittálódás esetén
pontosan a kívánt viselkedés.

Média tárolás. A `local` driver a `MEDIA_LOCAL_DIR` könyvtárba ír, és a
`/uploads/[...path]` útvonal szolgálja ki — **nem** a `public/` mappa, mert azt
a Next build időben pillanatképezi, így egy futás közben odamásolt fájl 404-et
adna. Egy node + csatolt kötet mellett ez elég; több példánynál vagy csak
olvasható fájlrendszeren `MEDIA_DRIVER=s3` kell (AWS S3, Cloudflare R2,
Backblaze B2, MinIO), `S3_ENDPOINT`-tal minden nem-AWS szolgáltatónál, és a
`MEDIA_PUBLIC_BASE_URL`-lel a bucket vagy a CDN eredetére állítva.

A `src/infrastructure/env.ts` induláskor validál. Hiányzó vagy értelmetlen konfiguráció
esetén a process olvasható hibával áll le, nem három réteggel lejjebb, futás
közben.

---

## 2. Adatbázis

```bash
npx prisma migrate deploy                                  # séma
npm run db:sql                                             # kiterjesztések, indexek, keresés, CHECK-ek
NODE_ENV=production npx tsx prisma/seed.ts                 # szerepkörök, törzsadat
```

Ez a három lépés egy **üres** adatbázison is végigmegy, és pontosan ez a sorrend
fut a Render `preDeployCommand`-jában. A `prisma/migrations/0_init` a séma
kiindulópontja: 30 tábla, 74 index, 40 idegen kulcs. Egy már meglévő,
`db push`-sal létrehozott adatbázison ne futtasd — ott előbb jelöld
alkalmazottnak:

```bash
npx prisma migrate resolve --applied 0_init
```

A `db:sql` a `prisma/sql/` fájljait alkalmazza névsorrendben, a
`DIRECT_DATABASE_URL`-en keresztül (DDL nem mehet tranzakciós pooleren). Minden
utasítás idempotens, így minden deploy után újrafuttatható — és futtatandó is,
mert ezeket a séma-kiegészítőket a Prisma migráció nem tartalmazza. `psql`
sincs hozzá telepítve: elég a Node runtime, ami a build futtatásához amúgy is
kell.

A seed éles környezetben **idempotens és biztonságos**: jogosultságokat,
szerepköröket, pozíciókat, formátumokat és beállítás-metaadatot szinkronizál,
demó tartalmat nem hoz létre (`NODE_ENV=production` alatt kihagyja), és a már
beállított értékeket nem írja felül.

### Az első fiók

A seed **nem** hoz létre tulajdonosi fiókot. Helyette: **aki elsőként
regisztrál az oldalon, megkapja a tulajdonosi jogosultságot** — azonnal aktív
fiókkal, e-mail-megerősítés nélkül.

Ez két gyakorlati problémát old meg egyszerre: nem kell egy generált jelszót
kihalászni a deploy logból, és nem kell működő SMTP ahhoz, hogy egyáltalán be
tudj lépni. A második és minden további regisztráló a szokásos `member`
szerepkört kapja, `PENDING` állapotban, e-mail-megerősítéssel.

A döntés egyetlen `SERIALIZABLE` tranzakcióban születik, tehát két egyszerre
érkező regisztrációból sem lehet két tulajdonos: a Postgres a másodikat
visszagörgeti.

> **Fontos:** a telepítés utáni első percekben bárki, aki eléri az oldalt,
> tulajdonossá tud válni. Regisztrálj közvetlenül azután, hogy a deploy zöldre
> váltott. Ha ezt nem akarod kockáztatni — zárt telepítésnél —, add meg a
> `SEED_OWNER_PASSWORD`-öt: akkor a seed hozza létre a tulajdonost, és a
> bootstrap nem lép életbe (a felhasználói tábla nem lesz üres).

Minden későbbi deploy után futtasd újra a seedet — így kerülnek be az újonnan
deklarált jogosultságok.

---

## 3. Build

```bash
npm run build
```

**A build nem fordul adatbázishoz, és nem is szabad neki.** Az alkalmazás minden
oldala futásidőben renderelődik (`export const dynamic = 'force-dynamic'` a gyökér
layoutban), mert a gyökér `generateMetadata` az adatbázisból olvassa az oldal
nevét — tehát minden oldal, a belépőűrlap is, egy lekérdezéstől függ. Egy
image builderben (Render, Fly, Docker layer) nincs elérhető adatbázis, így az
előrenderelés nem lassabb-de-frissebb kompromisszum lenne, hanem olyan build,
ami nem tud befejeződni.

Ezt a CI `Build adatbázis nélkül` job-ja őrzi: elérhetetlen `DATABASE_URL`-lel
buildel, és elbukik, ha bármi adatbázishoz nyúlt. A `Build és migrációs próba`
job önmagában nem elég — az ad adatbázist, tehát zölden maradna, miközben minden
deploy elhasal.

Ha új útvonalat veszel fel, ami saját `route.ts`-ként fut (`app/api/**`,
`sitemap.ts`, `robots.ts`, `rss.xml`), arra külön ki kell írni a
`force-dynamic`-ot: a route handlerek nem öröklik a layout beállítását.

---

## 4. Indítás

### Docker (Render, Fly, bármi, ami image-et futtat)

A konténer indulásakor a `scripts/start.sh` fut le:

```
migrate deploy → db:sql → seed → node server.js
```

Mindhárom előkészítő lépés idempotens, tehát minden újraindításkor bátran
lefuthat, és a meglévő adatokat nem bántja.

**A seed nem elhagyható.** Nélküle egyetlen szerepkör sincs az adatbázisban, a
regisztráció 500-zal elszáll, és senki nem tud belépni — még az első tulajdonos
sem. Az oldal ettől még betöltődik és 200-at ad, ezért ez a hiba nehezen
észrevehető: minden működni látszik, csak használni nem lehet.

### Docker Compose (self-hosted)

```bash
export AUTH_SECRET=$(openssl rand -base64 48)
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
export NEXT_PUBLIC_SITE_URL=https://yonagifansub.hu

docker compose up -d
docker compose --profile tools run --rm migrate    # migráció + seed
```

A stack Postgrest, Redist és az appot indítja. A Postgres portja nincs
publikálva a hoston — az app a compose hálózaton éri el.

### Node közvetlenül

```bash
npm ci
npm run build
npm start
```

A build `standalone` kimenetet készít (`output: 'standalone'` a
`next.config.ts`-ben), tehát az éles image-nek nincs szüksége a teljes
`node_modules`-ra — csak arra, amit a szerver ténylegesen importál.

A Next **nem** teszi bele a `public/`-ot és a `.next/static`-ot a standalone
kimenetbe; a Dockerfile ezeket külön másolja. Ezért van a `public/.gitkeep`
verziókövetve: a git nem tárol üres könyvtárat, enélkül a `COPY /app/public`
egy friss klónon elhasal.

### Render

A `render.yaml` blueprint a teljes stacket leírja (Postgres 16, web service,
napi cron job, feltöltéseknek lemez). Render → Blueprints → New Blueprint
Instance, és a repóra mutatva alkalmazd.

Amit **te** adsz meg — a fájl egyetlen titkot sem tartalmaz, és nem is
tartalmazhat: ami ide bekerül, az bekerül a repóba is, amit a GitHub
titok-szkennere jelent és a botok percek alatt kipróbálnak. Két mező kell:

| Mező | Mit írj bele |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | A valódi https origin (pl. `https://yonagifansub.hu`). A `__Host-` sütik és az azonos-eredet ellenőrzés is ezen múlik. |
| `RESEND_API_KEY` | A Resend kulcsod a https://resend.com/api-keys oldalról. `re_`-vel kezdődik. |

Minden más előre be van állítva: az `AUTH_SECRET` és a `CRON_SECRET`
generálását a Render végzi, az adatbázis URL-eket a kezelt példány adja, a
`MAIL_DRIVER=resend` pedig a blueprintben van.

### A feladó domainje

Egyetlen dolog van, ami emiatt még csendben elbukhat: a `MAIL_FROM` domainjét
**igazolni kell a Resendben** (https://resend.com/domains), különben minden
levél 422-vel jön vissza. Amíg nincs igazolva, két lehetőség van:

- állítsd a `MAIL_FROM`-ot `onboarding@resend.dev`-re — ez azonnal működik, de
  **csak a Resend-fiók tulajdonosának kézbesít**, tehát tesztelésre jó, élesre nem;
- vagy vedd fel és igazold a saját domained (néhány DNS rekord, pár perc).

Ezt nem kell fejben tartanod: az **admin vezérlőpult „Rendszer állapota”
paneljén** ott az E-mail sor, ami megkérdezi a Resendet, és kiírja, hogy
kimennek-e a levelek — igazolatlan domainnél sárga lámpával és a pontos okkal.

Két Render-specifikus dolog:

- **A migráció nem a buildben fut.** A build image builderben történik, ahonnan
  az adatbázis nem érhető el; a séma a `preDeployCommand`-ban jön létre, ami a
  build után és a forgalom átkapcsolása előtt fut.
- **A fájlrendszer efemer.** A blueprint ezért csatol egy 5 GB-os lemezt a
  `/var/data`-ra a `MEDIA_DRIVER=local` számára. A lemez egy példányhoz köti a
  service-t — ez a tudatos csere ezen a méreten. Vízszintes skálázáshoz vedd ki
  a lemezt és állíts `MEDIA_DRIVER=s3`-at.

### Vercel

Működik, két megkötéssel:

- `RATE_LIMIT_DRIVER=redis` **kötelező** — a szerver nélküli függvények nem
  osztoznak memórián, tehát a memória-driver példányonként számolna.
- A `DATABASE_URL` mutasson poolerre (Neon, Supabase, PgBouncer); a
  `DIRECT_DATABASE_URL` maradjon direkt a migrációkhoz.

---

## 5. Reverse proxy

A `X-Forwarded-For` fejlécet a proxy **írja felül**, ne fűzze hozzá — különben
a kliens hamisíthatja, és ezzel megkerülheti a rate limitet.

Caddy (a legrövidebb helyes konfiguráció):

```caddy
yonagifansub.hu {
    encode zstd gzip
    reverse_proxy localhost:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name yonagifansub.hu;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;   # felülír, nem fűz
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # A Next immutable asset-jei tartósan cache-elhetők.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

A biztonsági fejléceket az alkalmazás adja (`next.config.ts`) — ne duplikáld a
proxyban, mert az ütköző CSP-k némán letiltják egymást.

---

## 6. Ütemezett feladatok

Egy napi hívás, ami az elmaradt karbantartást elvégzi:

```bash
0 3 * * *  curl -fsS -H "X-Cron-Secret: $CRON_SECRET" https://yonagifansub.hu/api/cron/daily
```

A feladat: lejárt munkamenetek törlése, régi értesítések és letöltési
események elévültetése, esedékes ütemezett kiadások és hírek publikálása,
audit napló nyesése. Mindegyik művelet önmagában idempotens; egy kimaradt
futás nem okoz kárt, csak késleltet.

---

## 7. Ellenőrzés

```bash
curl -fsS https://yonagifansub.hu/api/health          # {"status":"ok"}
curl -sI  https://yonagifansub.hu | grep -i content-security-policy
curl -fsS https://yonagifansub.hu/robots.txt
curl -fsS https://yonagifansub.hu/sitemap.xml | head -5

# Az adminnak be kell dobnia egy anonim látogatót:
curl -s -o /dev/null -w '%{http_code}\n' https://yonagifansub.hu/admin   # 307
```

Utána jelentkezz be a tulajdonosi fiókkal, **változtasd meg a jelszót**, és
állítsd be az oldalt: Admin → Beállítások.

---

## Éles indulás előtti ellenőrzőlista

- [ ] `AUTH_SECRET` generált, nem másolt példa
- [ ] Az adatbázis felhasználója nem szuperfelhasználó
- [ ] TLS működik, HSTS fejléc megjelenik
- [ ] A `RESEND_API_KEY` be van állítva, és az admin vezérlőpult E-mail sora zöld
- [ ] A `MAIL_FROM` domainje igazolva a Resendben, és egy teszt-visszaállítás megérkezik
- [ ] `RATE_LIMIT_DRIVER=redis`, ha egynél több példány fut
- [ ] `MEDIA_DRIVER=s3`, ha egynél több példány fut — vagy csatolt kötet a
      `MEDIA_LOCAL_DIR`-en, és a mentés is viszi
- [ ] Az automatikus mentés fut, és **egy visszaállítást kipróbáltál**
- [ ] A tulajdonosi jelszó megváltoztatva az első belépés után
- [ ] Admin → Beállítások kitöltve (név, szlogen, kapcsolat, közösségi linkek)
- [ ] `indexingEnabled` állapota megfelel a szándéknak (staging: kikapcsolva)
- [ ] Egészségi végpont figyelve, riasztással
