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

      const sources = ['reddit', 'hackernews', 'producthunt', 'google'];
      const totalJobs = sources.length;

      // Record expected job count BEFORE enqueuing so ScraperProcessor
      // can check against it atomically when each job finishes.
      await this.prisma.jobProgress.update({
        where: { job_id: String(job.id) },
        data: {
          current_status: 'SCRAPING',
          progress_percentage: 25,
          current_task: 'Collecting data from sources',
          jobs_total: totalJobs,
          jobs_completed: 0,
        },
      });

      // Enqueue one scraping task per source
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

      this.logger.log(
        `Enqueued ${scrapingJobs.length} scraping tasks for idea ${ideaId}`,
        { jobId: job.id },
      );

      // Do NOT mark COMPLETED here — ScraperProcessor will set COMPLETED
      // once all ${totalJobs} scraping jobs have finished.
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
