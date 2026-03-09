import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ResearchService } from './research.service';
import { StartResearchDto } from './dto/start-research/start-research';
import { CreateIdeaDto } from './dto/create-idea/create-idea';

@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

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
}
