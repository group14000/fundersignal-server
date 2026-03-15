-- CreateTable
CREATE TABLE "Leads" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT,
    "role" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Leads_idea_id_idx" ON "Leads"("idea_id");

-- AddForeignKey
ALTER TABLE "Leads" ADD CONSTRAINT "Leads_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
