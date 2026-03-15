import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Post('jobs')
  startResearch(@Body() body: StartResearchDto) {
    return this.researchService.enqueueResearchJob(body);
  }

  @Get('jobs/:id')
  getResearchJob(@Param('id') id: string) {
    return this.researchService.getResearchJob(id);
  }

  @Post('ideas')
  createIdea(@Body() body: CreateIdeaDto) {
    return this.researchService.createIdeaWithJob(body);
  }

  @Get('ideas/:ideaId')
  getIdea(@Param('ideaId') ideaId: string) {
    return this.researchService.getIdea(ideaId);
  }

  @Post('test/pipeline')
  async runFullPipelineTest(@Body() body: CreateIdeaDto) {
    return this.researchService.runFullPipelineTest(body);
  }

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

  @Post('test/scraper')
  async testScraperService(@Body() body: TestScraperDto) {
    const scrapedContent = await this.scraperService.scrapeMultiple(
      body.searchResults,
    );

    return {
      inputCount: body.searchResults.length,
      successCount: scrapedContent.length,
      results: scrapedContent,
    };
  }

  @Post('test/research-data/store')
  async testStoreResearchData(@Body() body: StoreResearchDataDto) {
    const summary = await this.researchDataService.storeScrapedContent(
      body.ideaId,
      body.entries,
    );

    return {
      ideaId: body.ideaId,
      ...summary,
    };
  }

  @Post('test/research-data/prepare')
  async testPrepareResearchDataset(@Body() body: PrepareResearchDatasetDto) {
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
