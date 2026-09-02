-- Kiadások és letöltések eltávolítása.
--
-- A csapat epizódokban gondolkodik, nem kiadásokban: egy rész elkészül, és
-- felkerül. A külön „kiadás” réteg — formátum, verzió, tükrök, letöltésszámláló —
-- egy második, párhuzamos nyilvántartás volt ugyanarról, és a kettő azonnal
-- elcsúszott egymástól. Ami marad, az az epizód és a rajta lévő videóforrás.
--
-- Adatvesztéssel jár, és ez szándékos: a teljes, adatbázissal együtti
-- eltávolítás volt a kérés. Egyetlen adatot mentünk át, mert máshol sehol nem
-- szerepel, és nélküle megválaszolhatatlan a „mikor jelent meg a mi feliratunk”
-- kérdés: a kiadás dátumát.

-- ── 1. Az epizód megkapja a saját megjelenési dátumát ────────────────────────
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);

-- ── 2. Átmentés a kiadásokból, amíg még megvannak ────────────────────────────
--
-- `to_regclass` azért kell, mert ez a migráció olyan adatbázison is lefuthat,
-- ahol a táblák sosem léteztek (friss telepítés): ott a hivatkozás magára a
-- névre már fordítási hibát adna, nem üres eredményt.
DO $$
BEGIN
  IF to_regclass('public.releases') IS NOT NULL THEN
    -- A legkorábbi publikált kiadás dátuma. Egy epizódhoz több formátum és
    -- több verzió is tartozhatott; a v2 nem új megjelenés, hanem javítás, tehát
    -- a MIN a helyes válasz arra, hogy mikor lett elérhető.
    UPDATE "episodes" e
    SET "releasedAt" = sub.first_release
    FROM (
      SELECT r."episodeId" AS episode_id, MIN(r."releasedAt") AS first_release
      FROM "releases" r
      WHERE r."episodeId" IS NOT NULL
        AND r."status" = 'PUBLISHED'
        AND r."deletedAt" IS NULL
        AND r."releasedAt" IS NOT NULL
      GROUP BY r."episodeId"
    ) sub
    WHERE e."id" = sub.episode_id;
  END IF;
END $$;

-- Ami RELEASED állapotú, de nem kapott dátumot (kézzel átállított epizód, vagy
-- kiadás nélkül megjelöltek), az a saját utolsó módosítását kapja. Közelítés,
-- de a helyes nagyságrendben van — szemben a NULL-lal, ami kiejtené a hírfolyamból.
UPDATE "episodes"
SET "releasedAt" = "updatedAt"
WHERE "status" = 'RELEASED' AND "releasedAt" IS NULL;

-- A hírfolyam és a kezdőlap is „a legutóbbi megjelenések” szerint kérdez.
CREATE INDEX IF NOT EXISTS "episodes_status_releasedAt_idx"
  ON "episodes" ("status", "releasedAt");

-- ── 3. A kiadás- és letöltésvilág eltávolítása ───────────────────────────────
-- A sorrend a hivatkozások iránya: előbb a rájuk mutató táblák.
DROP TABLE IF EXISTS "download_events" CASCADE;
DROP TABLE IF EXISTS "download_links" CASCADE;
DROP TABLE IF EXISTS "releases" CASCADE;
DROP TABLE IF EXISTS "release_formats" CASCADE;
DROP TABLE IF EXISTS "storage_hosts" CASCADE;

DROP TYPE IF EXISTS "ReleaseKind";
DROP TYPE IF EXISTS "LinkKind";
DROP TYPE IF EXISTS "LinkAvailability";

-- A "Resolution" enum marad: a videóforrások (VideoSource) is használják.

-- ── 4. Ami már nem jelent semmit ─────────────────────────────────────────────
-- A jogosultságok adatvezéreltek; a szerepkör-hozzárendelés idegen kulcsa
-- cascade, így magától takarít.
DELETE FROM "permissions" WHERE "key" IN ('release:write', 'release:publish', 'release:delete');

DELETE FROM "site_settings" WHERE "key" = 'downloadsEnabled';

-- A meta leírás olyan funkciót ígért, ami megszűnt. Csak akkor írjuk át, ha még
-- a kiinduló szöveg áll benne: egy kézzel megfogalmazott leírást felülírni
-- annyi lenne, mint eldobni valakinek a munkáját egy migrációval.
UPDATE "site_settings"
SET "value" = to_jsonb('A Yonagi Fansub magyar feliratokat készít anime sorozatokhoz és filmekhez. Friss részek, projektállapotok és adásnaptár egy helyen.'::text)
WHERE "key" = 'siteDescription'
  AND "value" #>> '{}' LIKE '%letöltések egy helyen%';
