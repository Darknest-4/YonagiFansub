# Üzembe helyezés

## Amire szükség van

- **PostgreSQL 16+** — `pg_trgm` és `unaccent` kiterjesztéssel
- **Node 20.11+** (vagy Docker)
- **TLS-terminálás** — a `__Host-` prefixű sütik és a HSTS https-t követelnek
- *(opcionális)* Redis — csak több app példány esetén kötelező
- *(opcionális)* SMTP — enélkül a jelszó-visszaállítás nem működik

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

A `src/lib/env.ts` induláskor validál. Hiányzó vagy értelmetlen konfiguráció
esetén a process olvasható hibával áll le, nem három réteggel lejjebb, futás
közben.

---

## 2. Adatbázis

```bash
npx prisma migrate deploy                                  # séma
npm run db:sql                                             # kiterjesztések, indexek, CHECK-ek
NODE_ENV=production npx tsx prisma/seed.ts                 # szerepkörök, törzsadat
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

Az első futáskor létrehozza a tulajdonosi fiókot, és **egyszer** kiírja a
jelszót. Ha inkább te adod meg: `SEED_OWNER_PASSWORD=…`.

Minden későbbi deploy után futtasd újra a seedet — így kerülnek be az újonnan
deklarált jogosultságok.

---

## 3. Indítás

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

A build `standalone` kimenetet készít, tehát az éles image-nek nincs szüksége a
teljes `node_modules`-ra.

### Vercel

Működik, két megkötéssel:

- `RATE_LIMIT_DRIVER=redis` **kötelező** — a szerver nélküli függvények nem
  osztoznak memórián, tehát a memória-driver példányonként számolna.
- A `DATABASE_URL` mutasson poolerre (Neon, Supabase, PgBouncer); a
  `DIRECT_DATABASE_URL` maradjon direkt a migrációkhoz.

---

## 4. Reverse proxy

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

## 5. Ütemezett feladatok

Egy napi hívás, ami az elmaradt karbantartást elvégzi:

```bash
0 3 * * *  curl -fsS -H "X-Cron-Secret: $CRON_SECRET" https://yonagifansub.hu/api/cron/daily
```

A feladat: lejárt munkamenetek törlése, régi értesítések és letöltési
események elévültetése, esedékes ütemezett kiadások és hírek publikálása,
audit napló nyesése. Mindegyik művelet önmagában idempotens; egy kimaradt
futás nem okoz kárt, csak késleltet.

---

## 6. Ellenőrzés

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
- [ ] `MAIL_DRIVER=smtp`, és egy teszt-visszaállítás megérkezik
- [ ] `RATE_LIMIT_DRIVER=redis`, ha egynél több példány fut
- [ ] Az automatikus mentés fut, és **egy visszaállítást kipróbáltál**
- [ ] A tulajdonosi jelszó megváltoztatva az első belépés után
- [ ] Admin → Beállítások kitöltve (név, szlogen, kapcsolat, közösségi linkek)
- [ ] `indexingEnabled` állapota megfelel a szándéknak (staging: kikapcsolva)
- [ ] Egészségi végpont figyelve, riasztással
