-- Agent chunks used to duplicate an embedding as JSON text and pgvector. The
-- pgvector representation is now the only source of truth and is indexed.
CREATE EXTENSION IF NOT EXISTS vector;

-- Backfill any compatible legacy rows before removing the JSON copy. Rows with
-- a different dimension cannot be stored in vector(1024); they are derived
-- data and are rebuilt from their article after this migration is deployed.
UPDATE "agent_chunks"
SET "embedding_vector" = "embedding"::vector(1024)
WHERE "embedding_vector" IS NULL
  AND jsonb_typeof("embedding"::jsonb) = 'array'
  AND jsonb_array_length("embedding"::jsonb) = 1024;

DELETE FROM "agent_chunks"
WHERE "embedding_vector" IS NULL;

DROP INDEX IF EXISTS "idx_agent_chunks_embedding_vector_hnsw";

ALTER TABLE "agent_chunks"
  DROP COLUMN "embedding";

ALTER TABLE "agent_chunks"
  RENAME COLUMN "embedding_vector" TO "embedding";

ALTER TABLE "agent_chunks"
  ALTER COLUMN "embedding" SET NOT NULL;

CREATE INDEX "idx_agent_chunks_embedding_hnsw"
  ON "agent_chunks" USING hnsw ("embedding" vector_cosine_ops);
