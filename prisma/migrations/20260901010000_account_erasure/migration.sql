-- Erasing an account must not erase other people's replies.
--
-- `comments.userId` was NOT NULL with ON DELETE CASCADE, so deleting a user
-- deleted their comments, and each of those cascaded into its replies — posts
-- written by other people. Detaching the author instead keeps the thread intact
-- and renders the comment as "Törölt felhasználó".
ALTER TABLE "comments" DROP CONSTRAINT "comments_userId_fkey";
ALTER TABLE "comments" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
