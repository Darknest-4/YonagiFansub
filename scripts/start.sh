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
#   1. migrálás — a séma. Üres adatbázison létrehozza, meglévőn no-op.
#   2. db:sql   — trigram indexek, kiterjesztések és CHECK megszorítások,
#                 amiket a Prisma sémanyelve nem tud kifejezni. Ezek nem
#                 részei a migrációnak, tehát külön kell alkalmazni.
#   3. seed     — jogosultságok, szerepkörök, törzsadat.
#
# A 3. lépés NEM elhagyható. Nélküle nincs egyetlen szerepkör sem az
# adatbázisban, és a regisztráció 500-zal elszáll — vagyis senki nem tud belépni,
# még az első tulajdonos sem. Az oldal ettől még betöltődik és 200-at ad, ami
# pont azzá teszi, amit nehéz észrevenni: minden működni látszik, csak nem lehet
# használni.
#
# ## Miért van minden lépésen időkorlát
#
# Ezek a lépések a port megnyitása ELŐTT futnak, tehát amíg tartanak, a
# szolgáltatás nem válaszol. A Render (és minden hasonló platform) korlátozott
# ideig várja a portot, aztán megöli a deployt — időtúllépéssel, magyarázat
# nélkül. Egy beragadt adatbázis-lépés így tizennyolc perc néma csendként
# jelentkezik. A korlátok azért vannak, hogy a hiba *hibaként* jelenjen meg,
# amíg még van idő elolvasni.
#
# `set -e`: ha bármelyik lépés elbukik, a konténer meghal. Egy fél adatbázissal
# felálló példány rosszabb, mint egy, ami nem indul el — az utóbbit legalább
# jelzi a health check és a deploy naplója.

set -e

# A Prisma CLI indulásakor verziót ellenőrizne egy kimenő HTTPS-hívással. Deploy
# közben ez fölösleges, korlátozott kimenő hálózaton pedig maga is várakozás.
export CHECKPOINT_DISABLE=1

# Lépésenkénti időkorlátok másodpercben. Összegük bőven a platform port-várakozási
# ablakán belül marad, tehát a hiba még a deploy megölése előtt kiíródik.
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-240}"
SQL_TIMEOUT="${SQL_TIMEOUT:-180}"
SEED_TIMEOUT="${SEED_TIMEOUT:-180}"

# A BusyBox `timeout` régebbi kiadásai `-t` kapcsolót kérnek. Egyszer eldöntjük,
# melyik alak megy, hogy a hiányzó `timeout` ne az első lépésnél derüljön ki.
if timeout 1 true 2>/dev/null; then
  bounded() { limit="$1"; shift; timeout "$limit" "$@"; }
elif timeout -t 1 true 2>/dev/null; then
  bounded() { limit="$1"; shift; timeout -t "$limit" "$@"; }
else
  echo '  Figyelem: nincs használható timeout parancs, a lépések korlát nélkül futnak.'
  bounded() { shift; "$@"; }
fi

step_failed() {
  echo ""
  echo "  A(z) $1 lépés nem sikerült (kilépési kód: $2)."
  if [ "$2" = "124" ] || [ "$2" = "143" ]; then
    echo "  Ez időtúllépés: a lépés a megadott $3 másodperc alatt nem fejeződött be."
  fi
  echo "  A konténer nem indul el — egy féllábon álló példány rosszabb, mint egy hiányzó."
  exit 1
}

echo "→ [1/3] Séma migrálása…"
bounded "$MIGRATE_TIMEOUT" node scripts/db-migrate.mjs || step_failed "migrálás" "$?" "$MIGRATE_TIMEOUT"

echo "→ [2/3] SQL kiegészítők (indexek, kiterjesztések, megszorítások)…"
bounded "$SQL_TIMEOUT" node_modules/.bin/tsx scripts/apply-sql.ts || step_failed "SQL kiegészítők" "$?" "$SQL_TIMEOUT"

echo "→ [3/3] Jogosultságok, szerepkörök, törzsadat…"
bounded "$SEED_TIMEOUT" node_modules/.bin/tsx prisma/seed.ts || step_failed "seed" "$?" "$SEED_TIMEOUT"

echo "→ Indulás."
# `exec`: a Node lesz a folyamat, így a SIGTERM közvetlenül hozzá jut el, és a
# leállítás rendes marad ahelyett, hogy egy shell nyelné el a jelet.
exec node server.js
