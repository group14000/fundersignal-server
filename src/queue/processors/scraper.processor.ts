import { Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
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

      this.logger.log(
        `[${sourceType}] Stored ${storeResult.stored} entries for idea ${ideaId} ` +
          `(${storeResult.skippedDuplicate} duplicates skipped, ${storeResult.failed} failed)`,
      );

      return {
        storedEntries: storeResult.stored,
        source: sourceType,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Scraping failed for ${sourceType} idea ${ideaId}: ${message}`,
      );
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Scraping job ${job.id} failed`, error.stack);
  }
}
