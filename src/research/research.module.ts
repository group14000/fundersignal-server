import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { QueryGenerationService } from './query-generation.service';
import { SearchService } from './search.service';
import { ScraperService } from './scraper.service';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { OpenrouterModule } from '../openrouter/openrouter.module';

@Module({
  imports: [QueueModule, PrismaModule, AnalysisModule, OpenrouterModule],
  providers: [ResearchService, QueryGenerationService, SearchService, ScraperService],
  controllers: [ResearchController],
  exports: [QueryGenerationService, SearchService, ScraperService],
})
export class ResearchModule {}
