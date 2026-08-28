#!/bin/sh
#
# Indulási sorrend a konténerben: adatbázis felkészítése, majd a szerver.
#
# Külön fájlban, nem a Dockerfile `CMD`-jébe zsúfolva, mert három lépésről van
# szó, mindegyiknek megvan a maga indoka, és egy egysoros shell-lánc pont azt
# rejti el, hogy melyik miért kell.
#
# Mindhárom lépés idempotens, tehát minden konténerindításkor bátran lefuthat:
#
#   1. migrate deploy — a séma. Üres adatbázison létrehozza, meglévőn no-op.
#   2. db:sql         — trigram indexek, kiterjesztések és CHECK megszorítások,
#                       amiket a Prisma sémanyelve nem tud kifejezni. Ezek nem
#                       részei a migrációnak, tehát külön kell alkalmazni.
#   3. seed           — jogosultságok, szerepkörök, törzsadat.
#
# A 3. lépés NEM elhagyható. Nélküle nincs egyetlen szerepkör sem az
# adatbázisban, és a regisztráció 500-zal elszáll — vagyis senki nem tud belépni,
# még az első tulajdonos sem. Az oldal ettől még betöltődik és 200-at ad, ami
# pont azzá teszi, amit nehéz észrevenni: minden működni látszik, csak nem lehet
# használni.
#
# `set -e`: ha bármelyik lépés elbukik, a konténer meghal. Egy fél adatbázissal
# felálló példány rosszabb, mint egy, ami nem indul el — az utóbbit legalább
# jelzi a health check és a deploy naplója.

set -e

echo "→ [1/3] Séma migrálása…"
node_modules/.bin/prisma migrate deploy

echo "→ [2/3] SQL kiegészítők (indexek, kiterjesztések, megszorítások)…"
node_modules/.bin/tsx scripts/apply-sql.ts

echo "→ [3/3] Jogosultságok, szerepkörök, törzsadat…"
node_modules/.bin/tsx prisma/seed.ts

echo "→ Indulás."
# `exec`: a Node lesz a folyamat, így a SIGTERM közvetlenül hozzá jut el, és a
# leállítás rendes marad ahelyett, hogy egy shell nyelné el a jelet.
exec node server.js
