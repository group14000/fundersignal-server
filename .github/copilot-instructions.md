# FounderSignal Server - AI Agent Instructions

This document provides guidelines for AI agents (GitHub Copilot, Claude, etc.) to work effectively in the FounderSignal server codebase.

## Project Overview

**FounderSignal Server** is a NestJS-based backend API for analyzing startup ideas through market research, AI-powered insights, and data aggregation.

**Core Purpose:** Help founders validate startup ideas by automatically researching market problems, competitors, and demand signals.

**Tech Stack:**
- **Framework:** NestJS 11.0.1 with TypeScript
- **Database:** PostgreSQL (Docker) + Prisma 7.5.x ORM
- **Job Queue:** Redis + BullMQ 5.70.4
- **AI Integration:** OpenRouter SDK 0.9.11 (access to 300+ models)
- **Authentication:** Clerk Express 2.0.1
- **Validation:** class-validator + class-transformer
- **Default Port:** 5000

## Architecture & Module Structure

```
src/
├── app.module.ts                 # Root module
├── main.ts                       # Bootstrap (Clerk middleware, validation)
├── auth/                         # Clerk integration (guards, decorators)
├── openrouter/                   # AI model wrapper (chat completions)
├── queue/                        # BullMQ job processing
│   ├── processors/
│   │   ├── research-main.processor.ts    (web scraping jobs)
│   │   ├── scraper.processor.ts           (data collection)
│   │   └── analysis.processor.ts          (AI insights generation)
├── research/                     # Core startup research features
│   ├── research.service.ts       # Job envelope & orchestration
│   ├── query-generation.service.ts (AI-powered search queries)
│   ├── search-orchestrator.service.ts (multi-source result aggregation)
│   ├── scraper.service.ts        (URL content extraction)
│   ├── research-data.service.ts  (storage + dataset preparation)
│   ├── content-ranking.service.ts (rank/filter top research entries)
│   ├── insight-analysis.service.ts (LLM insights + fallback model)
│   ├── research-report.service.ts (structured report composition)
│   ├── research-agent.service.ts (3-iteration research loop orchestrator)
│   ├── research.controller.ts    # REST endpoints
├── analysis/                     # Market analysis & insights
│   ├── analysis.service.ts       # LLM-based analysis
│   └── analysis.processor.ts     # Queue processor
└── prisma/                       # Database connection
```

**Key Queues (Redis):**
- `research:main` - Main research job pipeline
- `scraping:tasks` - Web scraping operations
- `analysis:tasks` - AI analysis jobs
- `reports:generation` - Report compilation

## Setup & Development

### Prerequisites
- Node.js (compatible with TypeScript 5.7)
- Docker (for PostgreSQL + Redis)
- pnpm (package manager)

### Local Development Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL (Docker)
pnpm run db:up

# 3. Generate Prisma Client
pnpm run prisma:generate

# 4. Run initial migration
pnpm prisma:migrate --name init

# 5. Start development server
pnpm start:dev
```

### Environment Configuration
Create `.env` file with:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5433/postgres
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=5433

# Redis/BullMQ
REDIS_HOST=localhost
REDIS_PORT=6380

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-v1-...

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# App
PORT=5000
APP_NAME=FounderSignal
APP_URL=http://localhost:5000
```

### Build & Run Commands

```bash
# Development
pnpm start:dev          # Watch mode

# Production
pnpm build              # Compile TypeScript
pnpm start:prod         # Run compiled app

# Testing
pnpm test               # Unit tests
pnpm test:watch        # Watch mode
pnpm test:cov          # Coverage report
pnpm test:e2e          # End-to-end tests

# Database
pnpm prisma:studio     # Visual database editor
pnpm db:down           # Stop containers

# Code Quality
pnpm lint              # Fix ESLint issues
pnpm format            # Format code with Prettier
```

## NestJS Code Generation Policy

**Always use Nest CLI for scaffolding supported elements.** Do not manually create files when an official schematic exists.

### Standard Usage
```powershell
nest generate <schematic> <name> [path]
nest g <schematic> <name> [path]          # Short form
```

### Common Schematics
```powershell
nest g module feature-name
nest g controller feature-name
nest g service feature-name
nest g provider cache-provider
nest g guard auth
nest g interceptor logging
nest g pipe validation
nest g middleware request-logger
nest g filter http-exception
nest g decorator current-user
nest g resolver user-resolver
nest g resource post                       # Full CRUD scaffold
```

### Important Notes
1. Run commands from project root: `C:\Users\hp\OneDrive\Documents\github\FounderSignal\fundersignal-server`
2. Respect user-provided options (`--no-spec`, `--flat`, `--project`)
3. After scaffolding, modify generated files as needed
4. Only create files manually when no suitable schematic exists

### Anti-Pattern
❌ **Don't do this:**
```typescript
// ❌ Manually creating files Nest can generate
create src/users/users.service.ts
create src/users/users.controller.ts
```

✅ **Do this:**
```powershell
# ✅ Use Nest CLI
nest g resource users
```

## Database & Prisma

### Current Schema
9 models total: User, Idea, ResearchData, Competitor, Problem, JobProgress, Insight, ResearchLead, ResearchInsights.

### Common Prisma Tasks
```bash
# Create new migration after schema changes
pnpm prisma:migrate --name add_feature

# Introspect existing database
pnpm prisma:generate

# Reset database (dev only, deletes data)
pnpm prisma:migrate reset

# View/edit data graphically
pnpm prisma:studio
```

### Constraints
- **No .env.example files** - Only `.env` is required
- Use PostgreSQL with Prisma adapter-pg
- Migrations auto-tracked in `prisma/migrations/`

## API Conventions

### Port & Endpoints
- **Server Port:** 5000
- **Base URL:** `http://localhost:5000`

### Research Endpoints
```
POST   /research/jobs              # Enqueue research job
GET    /research/jobs/:id          # Get job status
POST   /research/ideas             # Create idea + auto-enqueue analysis
GET    /research/ideas/:ideaId     # Retrieve idea with insights
GET    /research/ideas/:ideaId/report  # Structured research report (auth required)
POST   /research/test/pipeline     # Test full pipeline (dev)
POST   /research/test/queries      # Test AI query generation (dev)
POST   /research/test/scraper      # Test URL content extraction (dev)
POST   /research/test/research-data/store    # Test data storage + dedup (dev)
POST   /research/test/research-data/prepare  # Test analysis dataset prep (dev)
```

### Current Research Pipeline
```
QueryGenerationService
  -> SearchOrchestratorService
  -> ScraperService
  -> ResearchDataService
  -> ContentRankingService
  -> InsightAnalysisService
  -> ResearchReportService
```

`ResearchAgentService` orchestrates up to 3 iterative cycles and runs final insight analysis at the end.

### Response Format
All endpoints use:
- `200` for successful responses
- `400` for validation errors
- `401` for authentication failures
- `500` for server errors

Use `@IsNotEmpty()`, `@IsEnum()`, etc. from `class-validator` in DTOs.

## OpenRouter AI Integration

### Current Model
- **Default:** `z-ai/glm-4.5-air:free` (fallback to `stepfun/step-3.5-flash:free`)
- **Service:** `OpenrouterService` in `src/openrouter/`

### API Structure (SDK v0.9.11)
```typescript
// Correct: chatGenerationParams contains model + messages
await this.openRouter.chat.send({
  chatGenerationParams: {
    model: "z-ai/glm-4.5-air:free",
    messages: [{ role: "user", content: "..." }],
    stream: false
  }
}, { fetchOptions: { headers: this.defaultHeaders } })
```

### Usage Patterns
- **Query Generation:** Uses LLM to generate market research keywords
- **Analysis:** Processes research data for demand signals
- **Fallback Logic:** Service has keyword extraction fallback (graceful degradation)

## Error Handling & Logging

### Error Patterns
```typescript
// ✅ Type-safe error handling
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  this.logger.warn(`Operation failed: ${message}`);
}
```

### Logging Levels
- `LOG` - Important state changes (job submitted, processing complete)
- `WARN` - Recoverable issues (fallback triggered, rate-limit)
- `ERROR` - Critical failures (use sparingly)
- `DEBUG` - Development/diagnostic info

## Queue Processing

### Job Lifecycle
1. **Enqueue** - ResearchService adds job to BullMQ queue
2. **Process** - Processor picks up job and executes
3. **Complete/Fail** - Job updates tracked in `job_progress` table
4. **Retrieve** - Client polls via `GET /research/jobs/:id`

### Queue Retry/Backoff Defaults
- `research:main` - 3 attempts, exponential backoff (5s), remove complete after 1 hour
- `scraping:tasks` - 5 attempts, exponential backoff (2s)
- `analysis:tasks` - 3 attempts, exponential backoff (1s)
- `reports:generation` - 2 attempts, fixed backoff (3s)

### Processor Pattern
```typescript
@Processor('queue-name')
export class MyProcessor {
  @Process()
  async handle(job: Job) {
    await this.service.doWork(job.data);
    return { success: true };
  }
}
```

## Clerk Authentication

### Route Protection
```typescript
@UseGuards(ClerkGuard)
@Post('protected')
protectedRoute(@CurrentUser() auth: AuthObject) {
  return auth.userId;
}
```

### Current Status
- Guard is enforced on `GET /research/ideas/:ideaId/report`
- Most other `/research` endpoints remain unguarded for dev/test workflows
- Report access is restricted to the idea owner

## Testing

### Test File Naming
- `*.spec.ts` - Unit tests (Jest)
- `jest-e2e.json` - E2E test config

### Running Tests
```bash
pnpm test                 # Run all unit tests
pnpm test:watch         # Watch mode
pnpm test:cov           # Coverage
pnpm test:e2e           # End-to-end
pnpm test:e2e -- test/app.e2e-spec.ts  # Run one e2e spec file
```

## Development Workflow

### When Adding Features
1. ✅ Use `nest g resource` for new modules with full CRUD
2. ✅ Add Prisma model first, run `prisma migrate dev`
3. ✅ Add DTOs for validation in `src/<feature>/dto/`
4. ✅ Implement service logic
5. ✅ Expose via controller endpoints
6. ✅ Add unit tests (`*.spec.ts`)
7. ✅ Run `pnpm lint && pnpm build` before commit

### When Calling OpenRouter
1. Use `OpenrouterService.sendPrompt()` for simple queries
2. Use `OpenrouterService.sendChatCompletion()` for advanced control
3. Wrap in try-catch, implement fallback gracefully
4. Log success at `LOG` level, failures at `WARN` level

### When Adding Queue Jobs
1. Define job data interface
2. Create processor with `@Processor()` decorator
3. Implement `@Process()` handler
4. Call from service via `queue.add(jobName, data)`
5. Track progress in `job_progress` table

## Common Pitfalls

1. ❌ **Manual file creation** - Use `nest g` instead
2. ❌ **`.env.example` files** - Delete these, only `.env` needed
3. ❌ **Forgetting `@Post()` decorator** - Required for POST endpoints
4. ❌ **Type-unsafe error handling** - Always check `error instanceof Error`
5. ❌ **OpenRouter SDK structure** - Remember `chatGenerationParams` wrapping
6. ❌ **Missing Prisma migration** - Run `pnpm prisma:migrate` after schema changes
7. ❌ **Not registering providers** - Always add to module's `providers: []`
8. ❌ **Circular dependencies** - Import issues with analysis.module, use proper module exports

## Useful Commands Reference

```bash
# Quick development loop
pnpm start:dev          # Terminal 1: Watch compilation
pnpm test:watch        # Terminal 2: Watch tests

# Database management
pnpm db:up             # Start PostgreSQL
pnpm db:down           # Stop containers
pnpm prisma:generate   # Update client after schema changes
pnpm prisma:migrate --name description
pnpm prisma:studio     # View/edit data

# Code quality
pnpm lint              # Fix linting issues
pnpm format            # Format code
pnpm build             # Type-check & compile

# Production
pnpm build && pnpm start:prod
```

## Asking for Help

When implementing a feature, include:
- What you're trying to build (new endpoint, job processor, etc.)
- Current errors/blockers
- Related files you've modified
- Whether you need database schema changes

For complex tasks, provide file context explicitly or ask to search the codebase first.

---

**Last Updated:** March 2026  
**Framework Version:** NestJS 11.0.1  
**Node Version:** Latest LTS compatible with TypeScript 5.7
