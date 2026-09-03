-- 360p mint felajánlható minőség.
--
-- Külön migrációban, nem az előzőbe olvasztva: a Postgres az enum új értékét
-- ugyanabban a tranzakcióban még nem engedi használni, amelyikben létrehozták.
-- Ez a fájl csak hozzáad; aki használni akarja, a következő tranzakcióban teszi.
DO $$ BEGIN
  ALTER TYPE "Resolution" ADD VALUE IF NOT EXISTS 'SD_360P' BEFORE 'SD_480P';
EXCEPTION WHEN others THEN NULL; END $$;
