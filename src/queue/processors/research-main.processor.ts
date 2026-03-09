import { Logger } from '@nestjs/common';
import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bullmq';

@Processor('research:main')
export class ResearchMainProcessor {
  private readonly logger = new Logger(ResearchMainProcessor.name);

  @Process('start-research')
  async handleStartResearch(job: Job) {
    this.logger.log(`Processing research job ${job.id}`);
    this.logger.debug({ payload: job.data });

    // Smoke worker: accept the payload and mark successful completion.
    return {
      ok: true,
      jobId: String(job.id),
      processedAt: new Date().toISOString(),
    };
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
