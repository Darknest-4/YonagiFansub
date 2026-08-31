# Üzemeltetési kézikönyv

Amit egy éles rendszernél tudni kell akkor, amikor baj van. Ez a dokumentum
feltételezi, hogy fáradt vagy és sietsz.

---

## Egészség és megfigyelés

```bash
curl -fsS https://yonagifansub.hu/api/health
```

```json
{ "status": "ok", "checks": { "database": { "ok": true, "latencyMs": 3 } } }
```

**503** akkor jön, ha az adatbázis nem érhető el — a load balancer ilyenkor
kiveszi a példányt a forgalomból. Ezt a végpontot figyeld, ne a főoldalt: a
főoldal cache-ből is kiszolgálható, miközben az adatbázis már halott.

**Naplók.** Élesben JSON soronként, parser nélkül betölthető Lokiba, Datadogba
vagy CloudWatchba. Amit érdemes figyelni:

| Minta | Jelentés |
| --- | --- |
| `"message":"Slow database query"` | 300 ms fölötti lekérdezés. Amíg nem bizonyított az ellenkezője: hiányzó index |
| `"level":"error"` | 5xx. Minden ilyenhez tartozik egy `requestId` |
| `"message":"Rate limit exceeded"` | Sok egy IP-ről: bot. Sok különbözőről: valami hurokban van a kliensen |
| `"action":"LOGIN_FAILED"` (audit) | Sorozatban egy fiókra: célzott brute force |

**Hibagyűjtő.** `ERROR_REPORTING_DSN` beállításával minden `error` szintű
naplósor egy Sentry-kompatibilis gyűjtőbe is elmegy, a `requestId` és a `route`
címkeként. Beállítatlanul a hibák csak a naplóba kerülnek — fejlesztésben ez a
helyes alapértelmezés. A küldés fire-and-forget, 4 mp időkorláttal: a gyűjtő
kiesése nem lassíthat egy amúgy is hibázó kérést. A payload a **már
maszkolt** naplókontextusból épül, tehát ami nem került a stdoutra, az harmadik
félhez sem kerül.

**Riasztás.** Minimum: egészség-végpont 2 percnél tovább nem 200; hibaarány
5% fölött 5 percen át; adatbázis-késleltetés 500 ms fölött.

---

## Mentés

### Mit kell menteni

| Mit | Miért | Gyakoriság |
| --- | --- | --- |
| PostgreSQL | Ez maga a rendszer | Naponta teljes + WAL folyamatosan |
| `AUTH_SECRET` és a többi titok | Enélkül a visszaállítás mindenkit kiléptet | Titokkezelőben, verziózva |
| Feltöltött média | Nincs az adatbázisban | Naponta, ha `MEDIA_DRIVER=local` |

A kódot nem kell menteni — az a git.

### Napi teljes mentés

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/yonagi

mkdir -p "$DEST"

# Custom formátum: párhuzamosan visszaállítható, és szelektíven is.
pg_dump "$DIRECT_DATABASE_URL" --format=custom --compress=9 \
        --file="$DEST/yonagi-$STAMP.dump"

# Titkosítás, mielőtt bárhova kerülne. A mentés személyes adatot tartalmaz.
age -r "$BACKUP_PUBLIC_KEY" -o "$DEST/yonagi-$STAMP.dump.age" "$DEST/yonagi-$STAMP.dump"
shred -u "$DEST/yonagi-$STAMP.dump"

# Külső tárhely — ugyanazon a gépen tárolt mentés nem mentés.
rclone copy "$DEST/yonagi-$STAMP.dump.age" "remote:yonagi-backups/"

# Feltöltött média (csak MEDIA_DRIVER=local mellett — s3-nál a bucket
# verziózása és életciklus-szabálya a mentés). A fájlnevek tartalomcímzettek,
# tehát a szinkron mindig inkrementális: ami egyszer felkerült, nem változik.
rclone sync "${MEDIA_LOCAL_DIR:-./storage/uploads}" "remote:yonagi-media/"

# Helyi retenció: 7 nap. A távoli oldalon állíts be életciklus-szabályt.
find "$DEST" -name '*.dump.age' -mtime +7 -delete
```

### Point-in-time recovery

A napi dump a padló, nem a mennyezet. WAL archiválással bármely pillanatra
vissza lehet állni — ez a különbség „elvesztettünk egy napot" és „elvesztettünk
öt percet" között:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'age -r KULCS -o /dev/stdout %p | rclone rcat remote:yonagi-wal/%f'
```

### Amit ténylegesen tesztelni kell

**Egy mentés, amit sosem állítottál vissza, nem mentés.** Negyedévente:

```bash
createdb yonagi_restore_test
age -d -i "$BACKUP_PRIVATE_KEY" yonagi-YYYYMMDD.dump.age \
  | pg_restore --dbname=yonagi_restore_test --jobs=4

psql yonagi_restore_test -c "SELECT count(*) FROM projects;"
psql yonagi_restore_test -c "SELECT max(\"createdAt\") FROM releases;"

dropdb yonagi_restore_test
```

Jegyezd fel, **mennyi ideig tartott** — ez a valós RTO-d, nem az, amit
feltételeztél.

---

## Visszaállítás

### Teljes adatvesztés

```bash
# 1. Állítsd le az appot, hogy ne írjon a fél-visszaállított adatbázisba.
docker compose stop app

# 2. Friss adatbázis.
dropdb yonagi && createdb yonagi

# 3. Visszaállítás.
age -d -i "$BACKUP_PRIVATE_KEY" yonagi-latest.dump.age \
  | pg_restore --dbname=yonagi --jobs=4 --no-owner

# 4. A séma-kiegészítők nincsenek a dumpban, ha csak adatot mentettél.
npm run db:sql

# 5. Jogosultságok szinkronizálása (ha a kód azóta frissült).
NODE_ENV=production npx tsx prisma/seed.ts

# 6. Indítás és ellenőrzés.
docker compose start app
curl -fsS https://yonagifansub.hu/api/health
```

### Véletlen törlés visszavonása

A legtöbb entitás **soft delete**. Törölni ritkán kell adatbázisból:

```sql
-- Mit töröltek nemrég?
SELECT action, "entityType", "entityId", summary, "actorLabel", "createdAt"
FROM audit_logs
WHERE action = 'DELETE' AND "createdAt" > now() - interval '7 days'
ORDER BY "createdAt" DESC;

-- Visszaállítás.
UPDATE projects SET "deletedAt" = NULL, "publishStatus" = 'DRAFT'
WHERE id = 'cmt…';
```

Projekthez az admin felületen is van visszaállítás
(`POST /api/v1/admin/projects/{id}/restore`), ami auditálva is van — kézi
`UPDATE` helyett inkább azt.

---

## Gyakori helyzetek

### „Nem tudok belépni"

```sql
-- Zárolva van? (6 sikertelen próba után 15 perc)
SELECT username, "failedLogins", "lockedUntil", status
FROM users WHERE email = 'valaki@example.com';

-- Zárolás feloldása.
UPDATE users SET "failedLogins" = 0, "lockedUntil" = NULL
WHERE email = 'valaki@example.com';
```

Ha `status = 'PENDING'`, akkor az e-mail-cím nincs megerősítve. Kézzel:

```sql
UPDATE users SET "emailVerifiedAt" = now(), status = 'ACTIVE'
WHERE email = 'valaki@example.com';
```

### „Nem érkezik meg a jelszó-visszaállító levél"

1. `MAIL_DRIVER` valóban `smtp`? A `console` driver csak a logba ír.
2. Nézd meg a logot: `"message":"Mail delivery failed"`.
3. A kérés meg sem történt? A rate limit 4/óra IP-nként.

A rendszer szándékosan nem árulja el, létezik-e a cím, ezért a felhasználó a
felületen ugyanazt látja mindkét esetben. A logban látod a különbséget.

### „Nulla adminisztrátorunk maradt"

Nem történhet meg a felületen keresztül (saját szerepkör nem módosítható, az
utolsó tulajdonos védett). Ha mégis:

```sql
UPDATE users
SET "roleId" = (SELECT id FROM roles WHERE key = 'owner'), status = 'ACTIVE'
WHERE email = 'te@example.com';
```

### „Lassú az oldal"

```sql
-- A legdrágább lekérdezések. (pg_stat_statements kiterjesztés kell hozzá.)
SELECT calls, round(mean_exec_time::numeric, 2) AS avg_ms, query
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- Sequential scan ott, ahol indexnek kellene lennie.
SELECT relname, seq_scan, idx_scan
FROM pg_stat_user_tables WHERE seq_scan > idx_scan AND seq_scan > 1000
ORDER BY seq_scan DESC;
```

Ha a keresés a lassú: futottak-e a trigram indexek
(`prisma/sql/02-search-indexes.sql`)? Ez a leggyakoribb kihagyott lépés —
`npm run db:sql` pótolja, újrafuttatása ártalmatlan.

### „Sok a spam a kapcsolati űrlapon"

A honeypot és a 3/óra limit a legtöbbet elviszi. Ami átjut:

```sql
UPDATE contact_messages SET status = 'SPAM'
WHERE status = 'NEW' AND "createdAt" > now() - interval '1 day'
  AND body ILIKE '%minta%';
```

Szükség esetén Admin → Beállítások → kapcsolati űrlap kikapcsolása.

---

## Karbantartási mód

Admin → Beállítások → **Karbantartási mód**. A látogatók karbantartási oldalt
kapnak, a csapat továbbra is eléri az admin felületet.

Ha az admin felület sem elérhető:

```sql
UPDATE site_settings SET value = 'true'::jsonb WHERE key = 'maintenanceMode';
```

A cache miatt legfeljebb egy órán belül lép életbe; azonnalihoz indítsd újra
az appot.

---

## Videó előkészítése online nézéshez

A saját tárhelyről játszott videó HLS-csomagként áll a tárhelyen: egy
`master.m3u8`, alatta változatonként egy playlist és a szegmensek. Ezt a
`npm run hls` állítja elő és tölti fel:

```bash
npm run hls -- --input ./yoru-01.mkv --key video/yoru-no-shizuku/01
```

A végén kiírt kulcsot (`video/yoru-no-shizuku/01/master.m3u8`) kell beírni az
adminban a videóforrás **Master playlist kulcsa** mezőjébe, a forrás típusa
pedig `HLS_PROXY`.

Hasznos kapcsolók:

| Kapcsoló | Mit csinál |
| --- | --- |
| `--ladder 1080,720,480` | Milyen felbontások készüljenek. A forrásnál nagyobb fokokat kihagyja. |
| `--subs felirat.ass` | Ráégeti a feliratot (libass). |
| `--segment 6` | Szegmenshossz másodpercben. |
| `--preset slow` | Lassabb, de kisebb fájl. |
| `--audio-lang hun` | Melyik hangsávot vigye, ha több van. |
| `--dry-run` | Csak kiírja az ffmpeg-parancsot. |

**A kódolás az enkóder gépén fut, nem a szerveren.** Egy epizód átkódolása
percekig-órákig tartó, több magot lekötő munka; a webszolgáltatás ettől
használhatatlanná válna. A szkriptnek ugyanaz a környezet kell, mint az
alkalmazásnak (`MEDIA_DRIVER`, `MEDIA_LOCAL_DIR` vagy `S3_*`) — a `.env.local`-t
magától beolvassa.

Előfeltétel: `ffmpeg` és `ffprobe` a `PATH`-on (`apt install ffmpeg`).

A master playlist szándékosan utoljára töltődik fel: ha a feltöltés félbeszakad,
a lejátszó nem talál olyan csomagot, aminek hiányoznak a szegmensei — a rossz
eset egy még nem látható epizód, nem egy 404-ekkel teli lejátszás.

---

## Deploy

```bash
git pull
npm ci
npx prisma migrate deploy        # séma először
npm run build
NODE_ENV=production npx tsx prisma/seed.ts   # új jogosultságok szinkronja
# szolgáltatás újraindítása
curl -fsS https://yonagifansub.hu/api/health
```

**A sorrend számít.** A migráció a build előtt fut, hogy egy régi séma ne
kerüljön össze egy új kóddal. A seed a build után, mert a jogosultság-lista a
kódból jön.

### Visszagörgetés

```bash
git checkout <előző-tag>
npm ci && npm run build
# szolgáltatás újraindítása
```

Az adatbázis-migrációk **nem gördülnek vissza automatikusan**. Ezért minden
migrációnak additívnak kell lennie (oszlop hozzáadása, nem átnevezése): így az
előző kódverzió is együtt tud élni az új sémával. Törlő migrációt csak akkor,
ha az előző verzió már nincs sehol futásban.

---

## Ütemezett feladatok

```
0 3 * * *  curl -fsS -H "X-Cron-Secret: $CRON_SECRET" https://.../api/cron/daily
```

Egy futás elvégzi:

| Lépés | Mit csinál |
| --- | --- |
| `publishedReleases`, `publishedNews` | Esedékes kiadások és hírek publikálása. A hír publikálása értesíti is a tagokat. |
| `prunedSessions`, `prunedExpiredTokens` | Lejárt munkamenetek és tokenek törlése. |
| `prunedNotifications` | Értesítések nyesése (90 nap). |
| `prunedDownloadEvents` | Letöltési események (12 hónap — az adatkezelési tájékoztatóban ígért retenció). |
| `prunedContactMessages` | Archivált és spam üzenetek (24 hónap). |
| `prunedAuditLogs` | Audit napló (12 hónap). |
| `checkedLinks` | A legrégebben ellenőrzött 60 letöltési link állapotának frissítése. |
| `resentVerifications` | Pótlólagos megerősítő levél azoknak, akik regisztráltak, de nem kapták meg. |
| `sentDigests` | Esedékes napi és heti e-mail összefoglalók kiküldése. |
| `syncedMetadata` | AniList/Jikan újraszinkron a legelavultabb projektekre. |

Minden lépés külön hibatűrő: ha egy elhasal, a többi lefut, és a hiba a logba
kerül. Kimaradt futás nem okoz kárt — a következő behozza.

**Letöltési tükrök.** A `checkedLinks` HEAD-kérést küld minden linkre (ha a
tárhely nem tud HEAD-et, egy egybájtos GET-et), és ez alapján állítja az
állapotát. Szándékosan csak a 404 és a 410 minősít halottnak: a 403 és a 429
botvédelem, az 5xx pedig egy rossz éjszaka — ezekből *akadozó* lesz, nem halott.
Egy élő tükör téves letiltása valódi letöltésbe kerül, egy halott meghagyása
egyetlen félrekattintásba. A halott linkekről figyelmeztetés kerül a naplóba.

**Megerősítő levél pótlása.** A `resendVerifications` azokat a fiókokat keresi
meg, amelyek az elmúlt 14 napban regisztráltak, de még mindig megerősítetlenek
— jellemzően azért, mert a levél elveszett vagy a levelezés éppen nem működött.
**Fiókonként legfeljebb egyszer** küld, futásonként legfeljebb 25-öt. Aki maga
keresi a megoldást, annak ott a `/megerosites-ujrakuldes` oldal és a
fiókbeállításokban megjelenő kártya — a pótlás azoknak szól, akik nem is tudják,
hogy kellett volna levelet kapniuk.

**Összefoglalók.** A `sentDigests` a felhasználó beállítása szerint napi vagy
heti levelet küld a saját értesítéseiből, és csak akkor, ha van mit. Az
esedékességet a `users.digestSentAt` mező dönti el, tehát egy kimaradt futás
késlelteti a levelet, nem hagyja ki — két futás pedig nem küldi ki kétszer.

---

## Retenció, egy helyen

| Adat | Megőrzés | Miért |
| --- | --- | --- |
| Letöltési események | 12 hónap | Elég a trendhez; ennyit ígér az adatkezelési tájékoztató |
| Értesítések | 90 nap (olvasottak) | Egy féléves értesítést senki nem néz meg |
| Kapcsolati üzenetek | 24 hónap (archivált/spam) | Jogi hivatkozhatóság |
| Audit napló | 12 hónap | A biztonsági bejegyzések (belépési hiba, jogosultság, törlés) tovább |
| Lejárt munkamenetek | 30 nap | Visszaélés-vizsgálathoz |
| Jelszó/megerősítő tokenek | Lejáratkor | Nincs okuk tovább létezni |
