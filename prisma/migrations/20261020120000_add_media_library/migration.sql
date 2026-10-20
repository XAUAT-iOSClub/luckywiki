-- AlterEnum
-- This migration adds more than one value to an enum. On PostgreSQL 12+ both
-- values can be added in one transaction as long as they are not used by DML
-- in the same transaction.
ALTER TYPE "LogAction" ADD VALUE 'DELETE_MEDIA';
ALTER TYPE "LogAction" ADD VALUE 'CLEANUP_MEDIA';

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_references" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE INDEX "media_assets_last_used_at_idx" ON "media_assets"("last_used_at");

-- CreateIndex
CREATE INDEX "media_assets_uploaded_by_id_idx" ON "media_assets"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "media_references_article_id_idx" ON "media_references"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_references_asset_id_article_id_key" ON "media_references"("asset_id", "article_id");

-- CreateIndex
-- Trigram indexes keep the media library search fast as the asset count grows.
CREATE INDEX IF NOT EXISTS "media_assets_file_name_trgm_idx"
  ON "media_assets" USING GIN ("file_name" "gin_trgm_ops");

CREATE INDEX IF NOT EXISTS "media_assets_alt_text_trgm_idx"
  ON "media_assets" USING GIN ("alt_text" "gin_trgm_ops");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
