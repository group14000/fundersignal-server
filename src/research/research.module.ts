import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { QueryGenerationService } from './query-generation.service';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { OpenrouterModule } from '../openrouter/openrouter.module';

@Module({
  imports: [QueueModule, PrismaModule, AnalysisModule, OpenrouterModule],
  providers: [ResearchService, QueryGenerationService],
  controllers: [ResearchController],
  exports: [QueryGenerationService],
})
export class ResearchModule {}
