-- Path change tracking: old paths become permanent (308) redirects.
-- See docs/PATH-CHANGE-AND-REDIRECTS.md for the full behaviour.

-- Postgres 12+ allows ADD VALUE inside a transaction block as long as the new
-- labels are not used before the transaction commits. Keep them at the top so
-- the rest of this migration never references them.
ALTER TYPE "LogAction" ADD VALUE IF NOT EXISTS 'MOVE_ARTICLE';
ALTER TYPE "LogAction" ADD VALUE IF NOT EXISTS 'RENAME_FOLDER';

CREATE TABLE "article_redirects" (
    "id" TEXT NOT NULL,
    "old_path" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMP(3),

    CONSTRAINT "article_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "article_redirects_old_path_key" ON "article_redirects"("old_path");
CREATE INDEX "article_redirects_article_id_idx" ON "article_redirects"("article_id");

ALTER TABLE "article_redirects"
    ADD CONSTRAINT "article_redirects_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "articles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
