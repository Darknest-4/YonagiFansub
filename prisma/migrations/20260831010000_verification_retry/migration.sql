-- Egy mező a megerősítő levél utólagos pótlásához.
--
-- A regisztráció pontosan egyszer küldi ki a megerősítő linket, és eddig nem
-- volt második esély: ha a levél elveszett — spam mappa, elgépelt cím, vagy
-- ahogy itt történt, rosszul beállított levelezés —, a fiók örökre
-- megerősítetlen maradt. Ez a mező jelöli, hogy az éjszakai pótlás már
-- foglalkozott a fiókkal, így legfeljebb egyszer küld utólag levelet.
--
-- A meglévő megerősítetlen fiókok szándékosan `NULL`-lal indulnak: pont ők azok,
-- akiknek a pótlás szól.

ALTER TABLE "users" ADD COLUMN "verificationRemindedAt" TIMESTAMP(3);
