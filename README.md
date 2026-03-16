# FounderSignal Server

FounderSignal Server is a NestJS backend that helps founders validate startup ideas through automated market research, signal detection, lead discovery, and AI-driven reporting.

## What This System Does

- Accepts startup ideas and runs asynchronous research jobs
- Collects and stores research content from web/discussion sources
- Builds vector memory with pgvector for semantic similarity workflows
- Ranks and filters noisy content before LLM analysis
- Detects market signals and opportunity areas
- Discovers potential leads and companies from signal-driven queries
- Generates insight summaries and structured reports

## High-Level System Design (HLD)

```mermaid
flowchart LR
    A[Client App / API Consumer] --> B[NestJS API Layer]
    B --> C[Auth Layer - ClerkGuard + CurrentUser]

    B --> D[Research Controller + Research Service]

    D --> E[BullMQ - research:main]
    E --> F[ResearchMainProcessor]
    F --> G[scraping:tasks]
    G --> H[ScraperProcessor]
    H --> I[analysis:tasks]
    I --> J[AnalysisProcessor]

    D --> K[Research Pipeline Services]

    subgraph K [Research Pipeline]
      K1[QueryGenerationService]
      K2[SearchOrchestratorService]
      K3[ScraperService]
      K4[ResearchDataService]
      K5[VectorMemoryService]
      K6[ContentRankingService]
      K7[MarketSignalService]
      K8[LeadDiscoveryService]
      K9[InsightAnalysisService]
      K10[ResearchReportService]
      K11[ResearchAgentService - iterative loop]

      K1 --> K2 --> K3 --> K4 --> K5 --> K6 --> K7 --> K8 --> K9 --> K10
      K11 --> K1
      K11 --> K9
    end

    K --> L[(PostgreSQL 18 + pgvector)]
    E --> M[(Redis)]
    K1 --> N[OpenRouter]
    K7 --> N
    K8 --> N
    K9 --> N

    L --> L1[Idea / ResearchData / ResearchInsights]
    L --> L2[MarketSignals / Leads / Competitor / Problem]
```

## End-to-End Research Sequence

```mermaid
sequenceDiagram
  autonumber
  participant U as Client App
  participant API as ResearchController/API
  participant RS as ResearchService
  participant Q as BullMQ (research:main)
  participant RP as ResearchMainProcessor
  participant QG as QueryGenerationService
  participant SO as SearchOrchestratorService
  participant SC as ScraperService
  participant RD as ResearchDataService
  participant VM as VectorMemoryService
  participant CR as ContentRankingService
  participant MS as MarketSignalService
  participant LD as LeadDiscoveryService
  participant IA as InsightAnalysisService
  participant RR as ResearchReportService
  participant DB as PostgreSQL + pgvector
  participant OR as OpenRouter

  U->>API: POST /research/jobs (idea payload)
  API->>RS: enqueueResearchJob()
  RS->>DB: create Idea + JobProgress
  RS->>Q: add start-research job
  API-->>U: 200 accepted + job metadata

  Q->>RP: process job
  RP->>QG: generate queries
  QG->>OR: LLM query generation
  OR-->>QG: queries

  RP->>SO: orchestrateSearch(queries)
  SO-->>RP: ranked URLs
  RP->>SC: scrapeMultiple(urls)
  SC-->>RP: extracted content

  RP->>RD: storeScrapedContent(ideaId, entries)
  RD->>DB: insert ResearchData rows
  RD->>VM: generateAndStoreEmbedding(content)
  VM->>OR: embeddings API
  VM->>DB: update vector column

  RP->>CR: getRankedDataset(ideaId)
  CR-->>RP: top research dataset
  RP->>MS: detectSignals(ideaId)
  MS->>OR: signal detection prompt
  MS->>DB: upsert MarketSignals
  RP->>LD: discoverLeads(ideaId)
  LD->>OR: lead extraction prompt
  LD->>DB: replace Leads for idea

  RP->>IA: analyzeIdea(ideaId)
  IA->>OR: insights prompt
  IA->>DB: upsert ResearchInsights/Insight

  U->>API: GET /research/ideas/:ideaId/report
  API->>RR: getReport(ideaId, userId)
  RR->>DB: fetch idea + insights
  RR-->>API: structured report
  API-->>U: 200 report response
```

## Core Modules

- Auth: Clerk integration with guards and current-user decorator
- OpenRouter: centralized LLM/AI access wrapper
- Queue: BullMQ queues and processors
- Research: end-to-end pipeline services and orchestrators
- Prisma: database client and schema access

## Tech Stack

- Framework: NestJS 11 + TypeScript
- Database: PostgreSQL 18 (Docker) + pgvector extension + Prisma
- Queue: Redis + BullMQ
- AI: OpenRouter SDK
- Auth: Clerk

## Local Setup

1. Install dependencies

   pnpm install

2. Start infrastructure (Postgres + Redis)

   pnpm run db:up

3. Generate Prisma client

   pnpm run prisma:generate

4. Apply migrations

   pnpm prisma:migrate --name init

5. Start server

   pnpm start:dev

Server base URL: http://localhost:5000

## Docker + pgvector Notes

- Postgres container image is pgvector/pgvector:pg18-trixie
- pgvector extension is enabled via docker/init/01-pgvector.sql
- If your Postgres volume already existed before init scripts were added, run once:

  docker compose exec postgres psql -U postgres -d fundersignal -c "CREATE EXTENSION IF NOT EXISTS vector;"

- Migration order matters for vector columns: extension migration must run before migrations that use vector(1536)

## Useful Commands

- Development

  pnpm start:dev

- Build

  pnpm build

- Tests

  pnpm test
  pnpm test:e2e

- Database

  pnpm prisma:generate
  pnpm prisma:migrate --name <migration_name>
  pnpm prisma:studio
  pnpm exec prisma migrate reset --force

- Infra

  pnpm db:up
  pnpm db:down

## Main Research Endpoints

- POST /research/jobs
- GET /research/jobs/:id
- POST /research/ideas
- GET /research/ideas/:ideaId
- GET /research/ideas/:ideaId/report
- POST /research/test/pipeline
- POST /research/test/queries
- POST /research/test/scraper
- POST /research/test/research-data/store
- POST /research/test/research-data/prepare

## Current Data Models (Prisma)

- User
- Idea
- ResearchData
- Competitor
- Problem
- JobProgress
- Insight
- ResearchLead
- ResearchInsights
- MarketSignals
- Lead

## Notes for Contributors

- Use Nest CLI scaffolding for Nest-supported artifacts
- Keep error handling type-safe (error instanceof Error)
- Preserve fallback behavior in AI-dependent services so pipeline execution continues
- Avoid adding .env.example in this repository (project policy uses .env only)
