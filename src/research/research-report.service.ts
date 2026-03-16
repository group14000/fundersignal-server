import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReportIdea {
  title: string;
  description: string;
  createdAt: Date;
}

export interface ReportAnalysis {
  demandScore: number;
  problems: string[];
  competitors: string[];
  opportunitySummary: string;
}

export interface ResearchReport {
  idea: ReportIdea;
  analysis: ReportAnalysis;
}

export interface ResearchReportResponse {
  report: ResearchReport;
}

export interface ProcessingResponse {
  status: 'processing';
}

@Injectable()
export class ResearchReportService {
  private readonly logger = new Logger(ResearchReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch and compose a structured research report for a given idea.
   * Returns a processing status object when insights are not yet available.
   *
   * @param ideaId   - CUID of the idea to report on
   * @param userId   - Clerk user ID; enforces ownership
   */
  async getReport(
    ideaId: string,
    userId: string,
  ): Promise<ResearchReportResponse | ProcessingResponse> {
    // 1. Load idea — throws 404 if not found
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      select: {
        title: true,
        description: true,
        user_id: true,
        created_at: true,
        research_insights: {
          select: {
            demand_score: true,
            problems: true,
            competitors: true,
            opportunity_summary: true,
            created_at: true,
          },
        },
      },
    });

    if (!idea) {
      throw new NotFoundException(`Idea ${ideaId} not found`);
    }

    // 2. Ownership check — only the creator may view the report
    if (!idea.user_id || idea.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this report');
    }

    // 3. Insights not ready yet
    if (!idea.research_insights) {
      this.logger.log(
        `Insights not yet available for idea ${ideaId} — returning processing status`,
      );
      return { status: 'processing' };
    }

    const ins = idea.research_insights;

    // 4. Parse JSON arrays stored as text
    let problems: string[] = [];
    let competitors: string[] = [];

    try {
      problems = JSON.parse(ins.problems);
    } catch {
      this.logger.warn(
        `Failed to parse problems JSON for idea ${ideaId} — defaulting to []`,
      );
    }

    try {
      competitors = JSON.parse(ins.competitors);
    } catch {
      this.logger.warn(
        `Failed to parse competitors JSON for idea ${ideaId} — defaulting to []`,
      );
    }

    return {
      report: {
        idea: {
          title: idea.title,
          description: idea.description,
          createdAt: idea.created_at,
        },
        analysis: {
          demandScore: ins.demand_score ?? 0,
          problems,
          competitors,
          opportunitySummary: ins.opportunity_summary ?? '',
        },
      },
    };
  }
}
