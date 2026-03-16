import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ResearchService } from './research.service';
import { QueryGenerationService } from './query-generation.service';
import { ScraperService } from './scraper.service';
import { ResearchDataService } from './research-data.service';
import { ResearchReportService } from './research-report.service';
import { StartResearchDto } from './dto/start-research/start-research';
import { CreateIdeaDto } from './dto/create-idea/create-idea';
import { TestScraperDto } from './dto/test-scraper/test-scraper.dto';
import {
  PrepareResearchDatasetDto,
  StoreResearchDataDto,
} from './dto/test-research-data/store-research-data.dto';
import { ClerkGuard } from '../auth/guards/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly queryGeneration: QueryGenerationService,
    private readonly scraperService: ScraperService,
    private readonly researchDataService: ResearchDataService,
    private readonly researchReportService: ResearchReportService,
  ) {}

  // 10 requests per minute — enqueuing is cheap but still bounded
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('jobs')
  startResearch(@Body() body: StartResearchDto) {
    return this.researchService.enqueueResearchJob(body);
  }

  @UseGuards(ClerkGuard)
  @Get('jobs/:id')
  getResearchJob(@Param('id') id: string) {
    return this.researchService.getResearchJob(id);
  }

  // 5 requests per minute — idea creation triggers LLM calls and queue jobs
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ClerkGuard)
  @Post('ideas')
  createIdea(
    @Body() body: CreateIdeaDto,
    @CurrentUser() auth: { userId: string },
  ) {
    return this.researchService.createIdeaWithJob(body, auth.userId);
  }

  @UseGuards(ClerkGuard)
  @Get('ideas/:ideaId')
  getIdea(
    @Param('ideaId') ideaId: string,
    @CurrentUser() auth: { userId: string },
  ) {
    return this.researchService.getIdea(ideaId, auth.userId);
  }

  @UseGuards(ClerkGuard)
  @Post('test/pipeline')
  async runFullPipelineTest(@Body() body: CreateIdeaDto) {
    return this.researchService.runFullPipelineTest(body);
  }

  @UseGuards(ClerkGuard)
  @Post('test/queries')
  async testQueryGeneration(@Body() body: CreateIdeaDto) {
    const queries = await this.queryGeneration.generateQueries({
      title: body.title,
      description: body.description,
      industry: body.industry,
    });

    return {
      idea: {
        title: body.title,
        description: body.description,
        industry: body.industry,
      },
      generatedQueries: queries,
      queryCount: queries.length,
    };
  }

  @UseGuards(ClerkGuard)
  @Post('test/scraper')
  async testScraperService(@Body() body: TestScraperDto) {
    // Validate every caller-supplied URL against the domain allowlist (SSRF protection).
    // This is the trust boundary for external input; internal pipeline bypasses this.
    for (const result of body.searchResults) {
      this.scraperService.validateUrl(result.url);
    }

    const scrapedContent = await this.scraperService.scrapeMultiple(
      body.searchResults,
    );

    return {
      inputCount: body.searchResults.length,
      successCount: scrapedContent.length,
      results: scrapedContent,
    };
  }

  @UseGuards(ClerkGuard)
  @Post('test/research-data/store')
  async testStoreResearchData(
    @Body() body: StoreResearchDataDto,
    @CurrentUser() auth: { userId: string },
  ) {
    // Ownership check: throws 404 or ForbiddenException if access denied
    await this.researchService.getIdea(body.ideaId, auth.userId);

    const summary = await this.researchDataService.storeScrapedContent(
      body.ideaId,
      body.entries,
    );

    return {
      ideaId: body.ideaId,
      ...summary,
    };
  }

  @UseGuards(ClerkGuard)
  @Post('test/research-data/prepare')
  async testPrepareResearchDataset(
    @Body() body: PrepareResearchDatasetDto,
    @CurrentUser() auth: { userId: string },
  ) {
    // Ownership check: throws 404 or ForbiddenException if access denied
    await this.researchService.getIdea(body.ideaId, auth.userId);

    return this.researchDataService.prepareDatasetForAnalysis(
      body.ideaId,
      body.limit,
    );
  }

  @UseGuards(ClerkGuard)
  @Get('ideas/:ideaId/report')
  getIdeaReport(
    @Param('ideaId') ideaId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.researchReportService.getReport(ideaId, user.userId);
  }
}
