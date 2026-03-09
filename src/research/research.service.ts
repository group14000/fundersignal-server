import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { StartResearchDto } from './dto/start-research/start-research';
import { CreateIdeaDto } from './dto/create-idea/create-idea';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResearchService {
	constructor(
		@InjectQueue('research:main') private readonly researchQueue: Queue,
		private readonly prisma: PrismaService,
	) {}

	async enqueueResearchJob(input: StartResearchDto) {
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

	async getResearchJob(id: string) {
		const job = await this.researchQueue.getJob(id);

		if (!job) {
			throw new NotFoundException(`Research job ${id} not found`);
		}

		return {
			queue: 'research:main',
			jobId: String(job.id),
			name: job.name,
			state: await job.getState(),
			progress: job.progress,
			data: job.data,
			result: job.returnvalue ?? null,
			failedReason: job.failedReason ?? null,
			timestamp: job.timestamp,
			processedOn: job.processedOn ?? null,
			finishedOn: job.finishedOn ?? null,
		};
	}

	async createIdeaWithJob(input: CreateIdeaDto) {
		// Create Idea record
		const idea = await this.prisma.idea.create({
			data: {
				title: input.title.trim(),
				description: input.description?.trim() ?? '',
				industry: input.industry?.trim() ?? null,
				target_market: input.targetMarket?.trim() ?? null,
				status: 'PENDING',
			},
		});

		let jobId: string | null = null;

		try {
			// Enqueue research job
			const job = await this.researchQueue.add('start-research', {
				ideaId: idea.id,
				title: input.title.trim(),
				description: input.description?.trim() ?? null,
				keywords: input.keywords ?? [],
				createdAt: new Date().toISOString(),
			});

			jobId = String(job.id);

			// Link idea to job
			await this.prisma.idea.update({
				where: { id: idea.id },
				data: { job_id: jobId },
			});

			// Create JobProgress record
			await this.prisma.jobProgress.create({
				data: {
					job_id: jobId,
					idea_id: idea.id,
					current_status: 'PENDING',
					progress_percentage: 0,
					current_task: 'Initializing',
				},
			});
		} catch (error) {
			// If job enqueue fails, mark idea as failed
			await this.prisma.idea.update({
				where: { id: idea.id },
				data: { status: 'FAILED' },
			});
			throw error;
		}

		return {
			idea: {
				id: idea.id,
				title: idea.title,
				description: idea.description,
				industry: idea.industry,
				targetMarket: idea.target_market,
				status: idea.status,
				jobId,
				createdAt: idea.created_at,
			},
		};
	}

	async getIdea(ideaId: string) {
		const idea = await this.prisma.idea.findUnique({
			where: { id: ideaId },
		});

		if (!idea) {
			throw new NotFoundException(`Idea ${ideaId} not found`);
		}

		let jobProgress: any = null;
		if (idea.job_id) {
			const progress = await this.prisma.jobProgress.findUnique({
				where: { job_id: idea.job_id },
			});
			if (progress) {
				jobProgress = {
					id: progress.id,
					jobId: progress.job_id,
					currentStatus: progress.current_status,
					progressPercentage: progress.progress_percentage,
					currentTask: progress.current_task,
					dataPointsCollected: progress.data_points_collected,
					competitorsFound: progress.competitors_found,
					problemsIdentified: progress.problems_identified,
					startedAt: progress.started_at,
					completedAt: progress.completed_at,
				};
			}
		}

		return {
			idea: {
				id: idea.id,
				title: idea.title,
				description: idea.description,
				industry: idea.industry,
				targetMarket: idea.target_market,
				status: idea.status,
				jobId: idea.job_id,
				demandScore: idea.demand_score,
				createdAt: idea.created_at,
				updatedAt: idea.updated_at,
			},
			jobProgress,
		};
	}
}
