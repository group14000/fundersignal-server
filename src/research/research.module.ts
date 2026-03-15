import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { QueryGenerationService } from './query-generation.service';
import { SearchService } from './search.service';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { ScraperService } from './scraper.service';
import { ResearchDataService } from './research-data.service';
import { InsightAnalysisService } from './insight-analysis.service';
import { ContentRankingService } from './content-ranking.service';
import { ResearchReportService } from './research-report.service';
import { ResearchAgentService } from './research-agent.service';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { OpenrouterModule } from '../openrouter/openrouter.module';

@Module({
  imports: [QueueModule, PrismaModule, AnalysisModule, OpenrouterModule],
  providers: [
    ResearchService,
    QueryGenerationService,
    SearchService,
    SearchOrchestratorService,
    ScraperService,
    ResearchDataService,
    InsightAnalysisService,
    ContentRankingService,
    ResearchReportService,
    ResearchAgentService,
  ],
  controllers: [ResearchController],
  exports: [
    QueryGenerationService,
    SearchService,
    SearchOrchestratorService,
    ScraperService,
    ResearchDataService,
    InsightAnalysisService,
    ContentRankingService,
    ResearchReportService,
    ResearchAgentService,
  ],
})
export class ResearchModule {}
