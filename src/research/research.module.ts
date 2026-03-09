import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [QueueModule, PrismaModule, AnalysisModule],
  providers: [ResearchService],
  controllers: [ResearchController],
})
export class ResearchModule {}
