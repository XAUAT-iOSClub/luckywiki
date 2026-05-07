-- AlterTable
ALTER TABLE "articles"
ADD COLUMN "description" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "editor" TEXT;
