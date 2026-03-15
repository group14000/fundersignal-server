-- Add idea_hash column to Idea for duplicate detection.
-- Nullable so existing rows without a hash are not affected.
-- Unique index prevents the same fingerprint from being inserted twice.

ALTER TABLE "Idea" ADD COLUMN "idea_hash" TEXT;
CREATE UNIQUE INDEX "Idea_idea_hash_key" ON "Idea"("idea_hash") WHERE "idea_hash" IS NOT NULL;
