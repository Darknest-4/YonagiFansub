-- An author may fix their own comment, and the reader must be able to tell.
ALTER TABLE "comments" ADD COLUMN "editedAt" TIMESTAMP(3);
