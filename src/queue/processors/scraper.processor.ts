import { Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchOrchestratorService } from '../../research/search-orchestrator.service';
import { ScraperService } from '../../research/scraper.service';
import {
  ResearchDataService,
  ScrapedResearchInput,
} from '../../research/research-data.service';

type ScrapingJobData = {
  ideaId: string;
  jobId: string;
  title: string;
  keywords: string[];
  sourceType: 'reddit' | 'hackernews' | 'producthunt' | 'google';
};

@Processor('scraping:tasks')
export class ScraperProcessor {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchOrchestrator: SearchOrchestratorService,
    private readonly scraperService: ScraperService,
    private readonly researchData: ResearchDataService,
  ) {}

  @Process()
  async handleScraping(job: Job<ScrapingJobData>) {
    const { ideaId, sourceType, title, keywords } = job.data;

    this.logger.log(`Starting scraping for ${sourceType}, idea ${ideaId}`);

    if (!ideaId || !sourceType) {
      throw new Error('ideaId and sourceType are required');
    }

    let storedCount = 0;

    try {
      // Step A — Build queries: prefer explicit keywords, fall back to idea title
      const queries =
        Array.isArray(keywords) && keywords.length > 0 ? keywords : [title];

      // Step B — Fetch ranked search results from HackerNews + Reddit
      const searchResults =
        await this.searchOrchestrator.orchestrateSearch(queries);

      this.logger.log(
        `[${sourceType}] ${searchResults.length} search results for idea ${ideaId}`,
      );

      // Step C — Scrape page content for each result URL
      const scraped = await this.scraperService.scrapeMultiple(searchResults);

      this.logger.log(
        `[${sourceType}] Scraped ${scraped.length} pages for idea ${ideaId}`,
      );

      // Step D — Store entries: deduplication + embedding generation happen inside
      const entries: ScrapedResearchInput[] = scraped.map((item) => ({
        source: item.source,
        title: item.title,
        url: item.url,
        content: item.content,
      }));

      const storeResult = await this.researchData.storeScrapedContent(
        ideaId,
        entries,
      );

      storedCount = storeResult.stored;

      this.logger.log(
        `[${sourceType}] Stored ${storeResult.stored} entries for idea ${ideaId} ` +
          `(${storeResult.skippedDuplicate} duplicates skipped, ${storeResult.failed} failed)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Scraping failed for ${sourceType} idea ${ideaId}: ${message}`,
      );
      // Do not re-throw: absorbing the error prevents BullMQ from retrying this
      // job and double-incrementing jobs_completed in the finally block below.
    } finally {
      this.logger.log(`Scraping job finished for source: ${sourceType}`);
      // Step E — Always increment jobs_completed so the idea never stalls.
      await this.markJobFinished(ideaId, storedCount);
    }

    return {
      storedEntries: storedCount,
      source: sourceType,
    };
  }

  /**
   * Atomically increments jobs_completed for this idea and, if all scraping
   * tasks are now done, transitions the idea to COMPLETED.
   *
   * PostgreSQL's UPDATE … RETURNING guarantees each concurrent caller receives
   * the post-increment value from their own write. Only the worker whose
   * increment brings jobs_completed up to jobs_total will trigger the
   * COMPLETED transition, preventing duplicate status writes.
   */
  private async markJobFinished(
    ideaId: string,
    dataPointsCollected: number,
  ): Promise<void> {
    const progress = await this.prisma.jobProgress.update({
      where: { idea_id: ideaId },
      data: {
        jobs_completed: { increment: 1 },
        data_points_collected: { increment: dataPointsCollected },
      },
      select: {
        jobs_completed: true,
        jobs_total: true,
      },
    });

    if (progress.jobs_completed < progress.jobs_total) {
      // Other scraping jobs are still running — nothing more to do here.
      return;
    }

    this.logger.log(
      `All scraping jobs completed for idea ${ideaId} ` +
        `(${progress.jobs_completed}/${progress.jobs_total} sources done)`,
    );

    await this.prisma.idea.update({
      where: { id: ideaId },
      data: {
        status: 'COMPLETED',
        research_completed_at: new Date(),
      },
    });

    await this.prisma.jobProgress.update({
      where: { idea_id: ideaId },
      data: {
        current_status: 'COMPLETED',
        progress_percentage: 100,
        current_task: 'Research complete',
        completed_at: new Date(),
      },
    });
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Scraping job ${job.id} failed`, error.stack);
  }
}
