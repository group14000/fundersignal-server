import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { StartResearchDto } from './dto/start-research/start-research';
import { CreateIdeaDto } from './dto/create-idea/create-idea';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisService } from '../analysis/analysis.service';

@Injectable()
export class ResearchService {
  constructor(
    @InjectQueue('research:main') private readonly researchQueue: Queue,
    @InjectQueue('analysis:tasks') private readonly analysisQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueResearchJob(input: StartResearchDto) {
    // Delegate to the full idea-creation flow so the job payload always
    // contains ideaId — ResearchMainProcessor requires it.
    return this.createIdeaWithJob(input as CreateIdeaDto);
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

  async createIdeaWithJob(input: CreateIdeaDto, userId?: string) {
    // Deduplicate: compute fingerprint and return existing idea if already analyzed
    const fingerprint = this.computeFingerprint(input);

    const existing = await this.prisma.idea.findUnique({
      where: { idea_hash: fingerprint },
    });

    if (existing) {
      return {
        duplicate: true,
        message: 'Idea already analyzed',
        idea: {
          id: existing.id,
          title: existing.title,
          description: existing.description,
          industry: existing.industry,
          targetMarket: existing.target_market,
          status: existing.status,
          jobId: existing.job_id,
          createdAt: existing.created_at,
        },
      };
    }

    // Create Idea record
    const idea = await this.prisma.idea.create({
      data: {
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        industry: input.industry?.trim() ?? null,
        target_market: input.targetMarket?.trim() ?? null,
        status: 'PENDING',
        user_id: userId ?? null,
        idea_hash: fingerprint,
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

  async getIdea(ideaId: string, userId: string) {
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
    });

    if (!idea) {
      throw new NotFoundException(`Idea ${ideaId} not found`);
    }

    if (idea.user_id && idea.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this idea');
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

  async runFullPipelineTest(input: CreateIdeaDto) {
    // Step 1: Create idea
    const ideaResponse = await this.createIdeaWithJob(input);

    // If this idea already exists, skip re-populating it with test data
    // to avoid corrupting a potentially completed analysis.
    if ('duplicate' in ideaResponse && ideaResponse.duplicate) {
      return {
        ...ideaResponse,
        message: 'Idea already analyzed; pipeline test skipped for existing idea',
      };
    }

    const ideaId = ideaResponse.idea.id;
    const jobId = ideaResponse.idea.jobId;

    // Step 2: Add test research data from various sources
    const testData = [
      {
        source_type: 'reddit',
        source_name: 'r/startups',
        source_url: 'https://reddit.com/r/startups',
        data_type: 'discussion',
        title: 'Looking for solutions to this problem',
        content: `I've been struggling with finding good solutions for this market problem.
This is a huge pain point and I know many others facing the same issue.
There's definitely a market here.`,
        author: 'startup_enthusiast',
        score: 245,
        comments_count: 42,
      },
      {
        source_type: 'hackernews',
        source_name: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        data_type: 'post',
        title: 'The future of this industry is changing',
        content: `This industry is ripe for disruption. The current solutions are outdated
and people are actively looking for alternatives. Great opportunity for new companies.`,
        author: 'tech_investor',
        score: 487,
        comments_count: 89,
      },
      {
        source_type: 'producthunt',
        source_name: 'Product Hunt',
        source_url: 'https://producthunt.com',
        data_type: 'post',
        title: 'New product solving the market gap',
        content: `Interesting approach but there are definitely more solutions needed in this space.
The market is hungry for options and innovation is happening rapidly.`,
        author: 'product_hunter',
        score: 512,
        comments_count: 156,
      },
      {
        source_type: 'google',
        source_name: 'Google Trends',
        source_url: 'https://trends.google.com',
        data_type: 'article',
        title: 'Market demand growing rapidly',
        content: `Search trends show 300% increase in queries related to this space.
Market reports indicate strong demand and willingness to pay for solutions.`,
        author: 'analyst',
        score: 367,
        comments_count: 23,
      },
    ];

    await Promise.all(
      testData.map((data) =>
        this.prisma.researchData.create({
          data: {
            idea_id: ideaId,
            ...data,
          },
        }),
      ),
    );

    // Step 3: Create competitors
    await Promise.all([
      this.prisma.competitor.create({
        data: {
          idea_id: ideaId,
          name: 'Existing Competitor A',
          website: 'https://competitor-a.com',
          description: 'Current market leader with basic features',
          funding_status: 'Series B',
          employee_count: 45,
          market_position: 'Strong but outdated',
          relevance_score: 0.8,
          threat_level: 'direct',
        },
      }),
      this.prisma.competitor.create({
        data: {
          idea_id: ideaId,
          name: 'Emerging Competitor B',
          website: 'https://competitor-b.com',
          description: 'Recent startup with modern approach',
          funding_status: 'Series A',
          employee_count: 12,
          market_position: 'Growing rapidly',
          relevance_score: 0.6,
          threat_level: 'direct',
        },
      }),
    ]);

    // Step 4: Identify problems
    await Promise.all([
      this.prisma.problem.create({
        data: {
          idea_id: ideaId,
          title: 'Current solutions are expensive',
          description: 'Users report high costs as primary pain point',
          severity: 'high',
          mention_count: 87,
          validation_score: 0.92,
        },
      }),
      this.prisma.problem.create({
        data: {
          idea_id: ideaId,
          title: 'Lack of integration with existing tools',
          description: 'No easy way to integrate with popular platforms',
          severity: 'high',
          mention_count: 65,
          validation_score: 0.85,
        },
      }),
      this.prisma.problem.create({
        data: {
          idea_id: ideaId,
          title: 'Poor user experience',
          description: 'Complex interfaces make adoption difficult',
          severity: 'medium',
          mention_count: 42,
          validation_score: 0.78,
        },
      }),
    ]);

    // Step 5: Update job progress and queue analysis
    await this.prisma.jobProgress.update({
      where: { job_id: jobId ?? undefined },
      data: {
        current_status: 'SCRAPING',
        progress_percentage: 50,
        current_task: 'Simulated data collection complete',
        data_points_collected: testData.length,
        competitors_found: 2,
        problems_identified: 3,
      },
    });

    // Step 6: Enqueue analysis task
    const analysisJob = await this.analysisQueue.add('analyze-research', {
      ideaId,
      jobId,
    });

    return {
      idea: ideaResponse.idea,
      message: 'Full pipeline test initiated',
      simulatedDataAdded: testData.length,
      competitorsCreated: 2,
      problemsCreated: 3,
      analysisJobQueued: String(analysisJob.id),
      nextStep: 'Analysis is running on analysis:tasks queue',
    };
  }

  private computeFingerprint(input: CreateIdeaDto): string {
    const raw =
      input.title.trim().toLowerCase() +
      (input.description?.trim().toLowerCase() ?? '') +
      (input.keywords ?? [])
        .map((k) => k.trim().toLowerCase())
        .sort()
        .join(',');
    return createHash('sha256').update(raw).digest('hex');
  }
}
