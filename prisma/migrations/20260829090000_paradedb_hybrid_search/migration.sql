-- ParadeDB provides BM25 full-text search (pg_search) and pgvector provides
-- ANN cosine search. The IF NOT EXISTS guards make this migration idempotent
-- when the extensions are pre-installed by the ParadeDB image.
CREATE EXTENSION IF NOT EXISTS pg_search;
CREATE EXTENSION IF NOT EXISTS vector;

-- Keep the original JSON embedding column so existing data and reindex tools
-- remain readable. The vector column is populated by the embedding sync path.
ALTER TABLE "agent_chunks"
  ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1024);

-- Populate rows generated with the default BAAI/bge-m3 model (1024 dims).
-- Rows with another dimension are intentionally left NULL and use the
-- application-level fallback until they are reindexed with a matching model.
UPDATE "agent_chunks"
SET "embedding_vector" = "embedding"::vector(1024)
WHERE "embedding_vector" IS NULL
  AND jsonb_typeof("embedding"::jsonb) = 'array'
  AND jsonb_array_length("embedding"::jsonb) = 1024;

CREATE INDEX IF NOT EXISTS "idx_agent_chunks_embedding_vector_hnsw"
  ON "agent_chunks" USING hnsw ("embedding_vector" vector_cosine_ops);

-- BM25 indexes used by the article search endpoint and chunk lexical recall.
CREATE INDEX IF NOT EXISTS "idx_articles_bm25"
  ON "articles" USING bm25 (id, title, description, markdown)
  WITH (key_field = 'id');

CREATE INDEX IF NOT EXISTS "idx_agent_chunks_bm25"
  ON "agent_chunks" USING bm25 (id, heading, content)
  WITH (key_field = 'id');
