import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenrouterService } from '../openrouter/openrouter.service';

interface AnalysisResult {
  demandScore: number;
  opportunitySummary: string;
  marketReadiness: 'hot' | 'warming' | 'cold';
  keyProblems: string[];
  competitorAnalysis: Record<string, any>;
  opportunityGaps: string[];
  userSignals: Record<string, any>;
}

export type { AnalysisResult };

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openrouter: OpenrouterService,
  ) {}

  /**
   * Analyze collected research data and generate insights
   */
  async analyzeResearchData(ideaId: string): Promise<AnalysisResult> {
    this.logger.log(`Starting analysis for idea ${ideaId}`);

    // Fetch the idea with all related data
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      include: {
        research_data: {
          take: 100, // Limit to recent data
          orderBy: { collected_at: 'desc' },
        },
        competitors: true,
        problems: true,
        research_leads: true,
      },
    });

    if (!idea) {
      throw new Error(`Idea ${ideaId} not found`);
    }

    // Prepare context for LLM analysis
    const analysisPrompt = this.buildAnalysisPrompt(idea);

    try {
      // Call OpenRouter to analyze
      const analysisResult = await this.openrouter.sendPrompt(analysisPrompt);

      // Parse the response
      const insights = this.parseAnalysisResponse(analysisResult);

      this.logger.log(`Analysis completed for idea ${ideaId}`, {
        demandScore: insights.demandScore,
        marketReadiness: insights.marketReadiness,
      });

      return insights;
    } catch (error) {
      this.logger.error(`Analysis failed for idea ${ideaId}`, error);
      throw error;
    }
  }

  /**
   * Save analysis insights to database
   */
  async saveInsights(
    ideaId: string,
    insights: AnalysisResult,
    jobId?: string,
  ): Promise<void> {
    try {
      // Check if insight already exists
      const existingInsight = await this.prisma.insight.findUnique({
        where: { idea_id: ideaId },
      });

      const insightData = {
        demand_score: insights.demandScore,
        opportunity_summary: insights.opportunitySummary,
        market_readiness: insights.marketReadiness,
        key_problems: JSON.stringify(insights.keyProblems),
        competitor_analysis: JSON.stringify(insights.competitorAnalysis),
        opportunity_gaps: JSON.stringify(insights.opportunityGaps),
        user_signals: JSON.stringify(insights.userSignals),
        model_used: 'stepfun/step-3.5-flash:free',
        generation_time_ms: Date.now(),
      };

      if (existingInsight) {
        await this.prisma.insight.update({
          where: { idea_id: ideaId },
          data: insightData,
        });
      } else {
        await this.prisma.insight.create({
          data: {
            idea_id: ideaId,
            job_id: jobId,
            ...insightData,
          },
        });
      }

      // Update idea with demand score
      await this.prisma.idea.update({
        where: { id: ideaId },
        data: {
          demand_score: insights.demandScore,
          status: 'COMPLETED',
        },
      });

      this.logger.log(`Insights saved for idea ${ideaId}`);
    } catch (error) {
      this.logger.error(`Failed to save insights for idea ${ideaId}`, error);
      throw error;
    }
  }

  /**
   * Build prompt for LLM analysis
   */
  private buildAnalysisPrompt(idea: any): string {
    const dataSourceSummary = this.summarizeResearchData(idea.research_data);
    const competitorSummary = idea.competitors
      .map(
        (c) =>
          `${c.name} (Relevance: ${c.relevance_score}%, Threat: ${c.threat_level})`,
      )
      .join('\n');
    const problemSummary = idea.problems
      .map(
        (p) =>
          `${p.title} (Severity: ${p.severity}, Mentions: ${p.mention_count})`,
      )
      .join('\n');

    return `
Analyze the following startup idea and research data to generate insights:

IDEA: ${idea.title}
DESCRIPTION: ${idea.description}
INDUSTRY: ${idea.industry || 'Not specified'}
TARGET MARKET: ${idea.target_market || 'Not specified'}

RESEARCH DATA SUMMARY:
${dataSourceSummary}

COMPETITORS IDENTIFIED:
${competitorSummary || 'None found'}

PROBLEMS IDENTIFIED:
${problemSummary || 'None found'}

Based on the research data collected, provide a JSON response with the following structure (respond ONLY with valid JSON):
{
  "demandScore": <number 0-10>,
  "opportunitySummary": "<brief summary of market opportunity>",
  "marketReadiness": "<'hot', 'warming', or 'cold'>",
  "keyProblems": ["<problem1>", "<problem2>"],
  "competitorAnalysis": {
    "count": <number>,
    "threats": "<analysis>",
    "opportunities": "<gaps>"
  },
  "opportunityGaps": ["<gap1>", "<gap2>"],
  "userSignals": {
    "sentiment": "<positive/neutral/negative>",
    "enthusiasm_level": "<high/medium/low>",
    "pain_points": "<key pain points mentioned>"
  }
}

Provide objective analysis based on the research data provided.
`;
  }

  /**
   * Summarize research data for prompting
   */
  private summarizeResearchData(researchData: any[]): string {
    if (!researchData || researchData.length === 0) {
      return 'No data collected';
    }

    const bySource = {};
    researchData.forEach((rd) => {
      if (!bySource[rd.source_type]) {
        bySource[rd.source_type] = [];
      }
      bySource[rd.source_type].push(rd);
    });

    return Object.entries(bySource)
      .map(([source, items]) => {
        const topItems = (items as any[])
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 3);
        return `
${source.toUpperCase()} (${(items as any[]).length} total items):
${topItems.map((item) => `- "${item.title || item.content.substring(0, 100)}" (Score: ${item.score || 0})`).join('\n')}
`;
      })
      .join('\n');
  }

  /**
   * Parse LLM response into typed insights
   */
  private parseAnalysisResponse(response: string): AnalysisResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        demandScore: Math.min(10, Math.max(0, parsed.demandScore ?? 5)),
        opportunitySummary: parsed.opportunitySummary || 'No summary available',
        marketReadiness: parsed.marketReadiness || 'warming',
        keyProblems: Array.isArray(parsed.keyProblems)
          ? parsed.keyProblems
          : [],
        competitorAnalysis: parsed.competitorAnalysis || {},
        opportunityGaps: Array.isArray(parsed.opportunityGaps)
          ? parsed.opportunityGaps
          : [],
        userSignals: parsed.userSignals || {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse LLM response as JSON: ${message}`);
      // Return default insights if parsing fails
      return {
        demandScore: 5,
        opportunitySummary: 'Analysis could not be completed',
        marketReadiness: 'warming',
        keyProblems: [],
        competitorAnalysis: {},
        opportunityGaps: [],
        userSignals: {},
      };
    }
  }
}
