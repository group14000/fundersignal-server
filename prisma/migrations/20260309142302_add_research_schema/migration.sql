-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "industry" TEXT,
    "target_market" TEXT,
    "job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "demand_score" DOUBLE PRECISION,
    "competitor_count" INTEGER,
    "problem_count" INTEGER,
    "research_started_at" TIMESTAMP(3),
    "research_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchData" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_name" TEXT,
    "source_url" TEXT,
    "data_type" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "score" INTEGER,
    "comments_count" INTEGER,
    "upvotes" INTEGER,
    "shares" INTEGER,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResearchData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "funding_status" TEXT,
    "employee_count" INTEGER,
    "market_position" TEXT,
    "relevance_score" DOUBLE PRECISION,
    "threat_level" TEXT NOT NULL DEFAULT 'direct',
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "validation_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobProgress" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "current_status" TEXT NOT NULL,
    "progress_percentage" INTEGER NOT NULL DEFAULT 0,
    "current_task" TEXT,
    "log_entries" TEXT NOT NULL DEFAULT '[]',
    "data_points_collected" INTEGER NOT NULL DEFAULT 0,
    "competitors_found" INTEGER NOT NULL DEFAULT 0,
    "problems_identified" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "JobProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "job_id" TEXT,
    "demand_score" DOUBLE PRECISION,
    "opportunity_summary" TEXT,
    "market_readiness" TEXT,
    "key_problems" TEXT NOT NULL DEFAULT '[]',
    "competitor_analysis" TEXT NOT NULL DEFAULT '[]',
    "opportunity_gaps" TEXT NOT NULL DEFAULT '[]',
    "user_signals" TEXT NOT NULL DEFAULT '[]',
    "model_used" TEXT,
    "tokens_used" INTEGER,
    "generation_time_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchLead" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "relevance" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Idea_job_id_key" ON "Idea"("job_id");

-- CreateIndex
CREATE INDEX "Idea_user_id_idx" ON "Idea"("user_id");

-- CreateIndex
CREATE INDEX "Idea_status_idx" ON "Idea"("status");

-- CreateIndex
CREATE INDEX "Idea_job_id_idx" ON "Idea"("job_id");

-- CreateIndex
CREATE INDEX "ResearchData_idea_id_idx" ON "ResearchData"("idea_id");

-- CreateIndex
CREATE INDEX "ResearchData_source_type_idx" ON "ResearchData"("source_type");

-- CreateIndex
CREATE INDEX "ResearchData_processed_idx" ON "ResearchData"("processed");

-- CreateIndex
CREATE INDEX "Competitor_idea_id_idx" ON "Competitor"("idea_id");

-- CreateIndex
CREATE INDEX "Problem_idea_id_idx" ON "Problem"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_job_id_key" ON "JobProgress"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgress_idea_id_key" ON "JobProgress"("idea_id");

-- CreateIndex
CREATE INDEX "JobProgress_job_id_idx" ON "JobProgress"("job_id");

-- CreateIndex
CREATE INDEX "JobProgress_idea_id_idx" ON "JobProgress"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_idea_id_key" ON "Insight"("idea_id");

-- CreateIndex
CREATE INDEX "Insight_idea_id_idx" ON "Insight"("idea_id");

-- CreateIndex
CREATE INDEX "ResearchLead_idea_id_idx" ON "ResearchLead"("idea_id");

-- AddForeignKey
ALTER TABLE "ResearchData" ADD CONSTRAINT "ResearchData_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobProgress" ADD CONSTRAINT "JobProgress_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchLead" ADD CONSTRAINT "ResearchLead_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
