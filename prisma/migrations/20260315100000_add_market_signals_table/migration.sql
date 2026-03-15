-- CreateTable
CREATE TABLE "MarketSignals" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "signals" TEXT NOT NULL DEFAULT '[]',
    "opportunity_areas" TEXT NOT NULL DEFAULT '[]',
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSignals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketSignals_idea_id_key" ON "MarketSignals"("idea_id");

-- CreateIndex
CREATE INDEX "MarketSignals_idea_id_idx" ON "MarketSignals"("idea_id");

-- AddForeignKey
ALTER TABLE "MarketSignals" ADD CONSTRAINT "MarketSignals_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
