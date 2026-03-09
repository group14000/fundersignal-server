import { Body, Controller, Post } from '@nestjs/common';
import { ResearchService } from './research.service';

type StartResearchRequest = {
	title: string;
	description?: string;
	keywords?: string[];
};

@Controller('research')
export class ResearchController {
	constructor(private readonly researchService: ResearchService) {}

	@Post('jobs')
	startResearch(@Body() body: StartResearchRequest) {
		return this.researchService.enqueueResearchJob(body);
	}
}
