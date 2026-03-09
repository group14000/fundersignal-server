import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenrouterModule } from '../openrouter/openrouter.module';

@Module({
  imports: [PrismaModule, OpenrouterModule],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
