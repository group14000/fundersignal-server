import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ResearchService } from './research.service';
import { QueryGenerationService } from './query-generation.service';
import { ScraperService } from './scraper.service';
import { StartResearchDto } from './dto/start-research/start-research';
import { CreateIdeaDto } from './dto/create-idea/create-idea';
import { TestScraperDto } from './dto/test-scraper/test-scraper.dto';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly queryGeneration: QueryGenerationService,
    private readonly scraperService: ScraperService,
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
    const scrapedContent =
      await this.scraperService.scrapeMultiple(body.searchResults);

    return {
      inputCount: body.searchResults.length,
      successCount: scrapedContent.length,
      results: scrapedContent,
    };
  }
}

