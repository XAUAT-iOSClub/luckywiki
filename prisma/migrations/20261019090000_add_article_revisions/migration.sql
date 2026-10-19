-- CreateTable
CREATE TABLE "article_revisions" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_revisions_article_id_created_at_idx" ON "article_revisions"("article_id", "created_at");

-- CreateIndex
CREATE INDEX "article_revisions_author_id_idx" ON "article_revisions"("author_id");

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New audit action for rollbacks. The log detail still only stores article
-- metadata (title/path/status), never the body.
ALTER TYPE "LogAction" ADD VALUE 'RESTORE_ARTICLE';

-- Backfill one baseline revision per existing article so the first edit after
-- this migration can still be diffed against the pre-migration content.
INSERT INTO "article_revisions" ("id", "article_id", "markdown", "title", "author_id", "created_at")
SELECT
    'rev_' || md5("articles"."id" || "articles"."updated_at"::text || random()::text),
    "articles"."id",
    "articles"."markdown",
    "articles"."title",
    "articles"."author_id",
    "articles"."updated_at"
FROM "articles";
