-- Két mező, két hiányzó kézbesítési lánchoz.
--
-- `news_posts.notifiedAt`: a hírbejelentés fan-outja pontosan egyszer futhat le.
-- Enélkül egy visszavont és újra publikált hír mindenkit újra értesítene — ez az
-- a hiba, amit a felhasználók leiratkozással jeleznek vissza.
--
-- `users.digestSentAt`: az e-mail összefoglaló eddig egy beállítás volt kód
-- nélkül. Az éjszakai futás ebből tudja, esedékes-e a napi vagy heti levél, így
-- egy kimaradt futás késlelteti, nem kihagyja — két futás pedig nem küldi ki
-- kétszer.

ALTER TABLE "news_posts" ADD COLUMN "notifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "digestSentAt" TIMESTAMP(3);

-- A már megjelent hírek nem kapnak visszamenőleges értesítést: aki eddig
-- ránézett az oldalra, az látta őket, és egy régi bejegyzésről kapott mai
-- értesítés hibának tűnne.
UPDATE "news_posts" SET "notifiedAt" = "publishedAt"
WHERE "status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL;
