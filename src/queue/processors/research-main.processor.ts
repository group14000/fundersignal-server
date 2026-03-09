import { Logger } from '@nestjs/common';
import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('research:main')
export class ResearchMainProcessor {
  private readonly logger = new Logger(ResearchMainProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('scraping:tasks') private readonly scrapingQueue: Queue,
  ) {}

  @Process('start-research')
  async handleStartResearch(job: Job) {
    const ideaId = job.data?.ideaId;

    this.logger.log(`Processing research job ${job.id}`, { ideaId });
    this.logger.debug({ payload: job.data });

    if (!ideaId) {
      throw new Error('ideaId is required in job data');
    }

    try {
      // Update Idea status to PROCESSING
      await this.prisma.idea.update({
        where: { id: ideaId },
        data: {
          status: 'SCRAPING',
          research_started_at: new Date(),
        },
      });

      // Update JobProgress
      await this.prisma.jobProgress.update({
        where: { job_id: String(job.id) },
        data: {
          current_status: 'SCRAPING',
          progress_percentage: 25,
          current_task: 'Collecting data from sources',
        },
      });

      // Enqueue scraping tasks for each source
      const sources = ['reddit', 'hackernews', 'producthunt', 'google'];
      const scrapingJobs = await Promise.all(
        sources.map((sourceType) =>
          this.scrapingQueue.add(`scrape-${sourceType}`, {
            ideaId,
            jobId: String(job.id),
            title: job.data.title,
            keywords: job.data.keywords || [],
            sourceType,
          }),
        ),
      );

      this.logger.log(`Enqueued ${scrapingJobs.length} scraping tasks`, {
        ideaId,
        jobId: job.id,
      });

      // Wait briefly for scraping to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mark as completed
      await this.prisma.idea.update({
        where: { id: ideaId },
        data: {
          status: 'COMPLETED',
          research_completed_at: new Date(),
        },
      });

      await this.prisma.jobProgress.update({
        where: { job_id: String(job.id) },
        data: {
          current_status: 'COMPLETED',
          progress_percentage: 100,
          current_task: 'Research complete',
          completed_at: new Date(),
        },
      });

      return {
        ok: true,
        jobId: String(job.id),
        ideaId,
        scrapingJobsEnqueued: scrapingJobs.length,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to process research job ${job.id}`, error);

      // Mark idea as FAILED
      try {
        await this.prisma.idea.update({
          where: { id: ideaId },
          data: { status: 'FAILED' },
        });

        await this.prisma.jobProgress.update({
          where: { job_id: String(job.id) },
          data: {
            current_status: 'FAILED',
            current_task: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        });
      } catch (updateError) {
        this.logger.error(
          'Failed to update idea/job progress on error',
          updateError,
        );
      }

      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Job active: ${job.id}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: unknown) {
    this.logger.log(`Job completed: ${job.id}`);
    this.logger.debug({ result });
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job failed: ${job.id}`, error.stack);
  }
}
