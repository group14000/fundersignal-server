import { Logger } from '@nestjs/common';
import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalysisService } from '../../analysis/analysis.service';

@Processor('analysis:tasks')
export class AnalysisProcessor {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
  ) {}

  @Process('analyze-research')
  async handleAnalyzeResearch(job: Job) {
    const ideaId = job.data?.ideaId;
    const jobId = job.data?.jobId;

    this.logger.log(`Processing analysis job ${job.id}`, { ideaId, jobId });

    if (!ideaId) {
      throw new Error('ideaId is required in job data');
    }

    try {
      // Update JobProgress to indicate analysis is starting
      if (jobId) {
        await this.prisma.jobProgress.update({
          where: { job_id: jobId },
          data: {
            current_status: 'ANALYZING',
            progress_percentage: 70,
            current_task: 'Analyzing collected data',
          },
        });
      }

      // Perform analysis
      const insights = await this.analysisService.analyzeResearchData(ideaId);

      // Save insights to database
      await this.analysisService.saveInsights(ideaId, insights, jobId);

      // Mark idea as COMPLETED now that analysis has been saved
      await this.prisma.idea.update({
        where: { id: ideaId },
        data: { status: 'COMPLETED' },
      });

      // Update JobProgress to indicate completion
      if (jobId) {
        await this.prisma.jobProgress.update({
          where: { job_id: jobId },
          data: {
            current_status: 'COMPLETED',
            progress_percentage: 100,
            current_task: 'Analysis complete',
            completed_at: new Date(),
          },
        });
      }

      this.logger.log(`Analysis completed for idea ${ideaId}`, {
        demandScore: insights.demandScore,
        marketReadiness: insights.marketReadiness,
      });

      return {
        ok: true,
        ideaId,
        jobId,
        insights,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Analysis failed for idea ${ideaId}`, error);
      const message = error instanceof Error ? error.message : String(error);

      // Update JobProgress to indicate failure
      if (jobId) {
        await this.prisma.jobProgress.update({
          where: { job_id: jobId },
          data: {
            current_status: 'FAILED',
            current_task: `Analysis failed: ${message}`,
          },
        });
      }

      // Mark idea as failed
      await this.prisma.idea.update({
        where: { id: ideaId },
        data: { status: 'FAILED' },
      });

      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job ${job.id} completed with result:`, result);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${err.message}`);
  }
}
