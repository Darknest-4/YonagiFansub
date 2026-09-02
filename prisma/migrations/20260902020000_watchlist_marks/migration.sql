-- Nézési lista: csak az, amit a néző kézzel mond.
--
-- A „nézem" és a „befejezett" nem tárolt állapot, hanem a nézési
-- előrehaladásból számolt válasz. Egy tárolt másolatuk azonnal elavulna: valaki
-- megnézne egy részt, a lista pedig tovább írná, hogy tervezi. Ide csak az a
-- két érték kerül, ami semmiből nem következik.

CREATE TYPE "WatchlistMarkKind" AS ENUM ('PLANNED', 'DROPPED');

CREATE TABLE "watchlist_marks" (
  "userId"    TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind"      "WatchlistMarkKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "watchlist_marks_pkey" PRIMARY KEY ("userId", "projectId")
);

-- A profil oldali lista a legutóbb megjelöltekkel kezd.
CREATE INDEX "watchlist_marks_userId_updatedAt_idx"
  ON "watchlist_marks" ("userId", "updatedAt");

-- Cascade mindkét irányban: a jelölés a nézőé és a projekté együtt, önmagában
-- nem jelent semmit. Fiók törlésekor a `deleteOwnAccount` amúgy is nevesítve
-- takarít, de az idegen kulcs a biztosíték arra, hogy árva sor ne maradjon.
ALTER TABLE "watchlist_marks"
  ADD CONSTRAINT "watchlist_marks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watchlist_marks"
  ADD CONSTRAINT "watchlist_marks_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
