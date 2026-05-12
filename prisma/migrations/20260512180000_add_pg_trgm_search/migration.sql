-- Enable the pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes to accelerate ILIKE queries on title and markdown
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm
  ON "articles" USING GIN ("title" "gin_trgm_ops");

CREATE INDEX IF NOT EXISTS idx_articles_markdown_trgm
  ON "articles" USING GIN ("markdown" "gin_trgm_ops");
