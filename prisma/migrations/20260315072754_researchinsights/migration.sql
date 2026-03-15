-- CreateTable
CREATE TABLE "ResearchInsights" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "demand_score" DOUBLE PRECISION,
    "problems" TEXT NOT NULL DEFAULT '[]',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "opportunity_summary" TEXT,
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchInsights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchInsights_idea_id_key" ON "ResearchInsights"("idea_id");

-- CreateIndex
CREATE INDEX "ResearchInsights_idea_id_idx" ON "ResearchInsights"("idea_id");

-- AddForeignKey
ALTER TABLE "ResearchInsights" ADD CONSTRAINT "ResearchInsights_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
