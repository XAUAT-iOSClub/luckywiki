-- CreateTable
CREATE TABLE "agent_chunks" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_chunks_article_id_chunk_index_key" ON "agent_chunks"("article_id", "chunk_index");

-- CreateIndex
CREATE INDEX "agent_chunks_article_id_idx" ON "agent_chunks"("article_id");

-- AddForeignKey
ALTER TABLE "agent_chunks" ADD CONSTRAINT "agent_chunks_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
