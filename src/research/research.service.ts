import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

type EnqueueResearchJobInput = {
	title: string;
	description?: string;
	keywords?: string[];
};

@Injectable()
export class ResearchService {
	constructor(
		@InjectQueue('research:main') private readonly researchQueue: Queue,
	) {}

	async enqueueResearchJob(input: EnqueueResearchJobInput) {
		if (!input.title?.trim()) {
			throw new BadRequestException('title is required');
		}

		const job = await this.researchQueue.add('start-research', {
			title: input.title.trim(),
			description: input.description?.trim() ?? null,
			keywords: input.keywords ?? [],
			createdAt: new Date().toISOString(),
		});

		return {
			queue: 'research:main',
			jobId: String(job.id),
			state: await job.getState(),
		};
	}
}
