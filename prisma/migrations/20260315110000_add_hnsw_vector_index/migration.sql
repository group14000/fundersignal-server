-- Add HNSW index on ResearchData.embedding for fast cosine similarity search.
-- Only indexes rows where embedding IS NOT NULL to avoid indexing empty entries.
-- Requires pgvector (already enabled in migration 20260315092908_enable_pgvector).

CREATE INDEX researchdata_embedding_hnsw
ON "ResearchData"
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;
