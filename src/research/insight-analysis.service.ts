import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from '../openrouter/openrouter.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchDataService } from './research-data.service';

export interface MarketInsights {
  demandScore: number;
  problems: string[];
  competitors: string[];
  opportunitySummary: string;
}

export interface InsightAnalysisResult {
  ideaId: string;
  insights: MarketInsights;
  modelUsed: string;
  storedInsightId: string;
}

@Injectable()
export class InsightAnalysisService {
  private readonly logger = new Logger(InsightAnalysisService.name);

  private readonly PRIMARY_MODEL = 'z-ai/glm-4.5-air:free';
  private readonly FALLBACK_MODEL = 'stepfun/step-3.5-flash:free';
  private readonly MAX_ENTRIES = 20;
  private readonly MAX_ENTRY_CHARS = 1500;

  constructor(
    private readonly researchData: ResearchDataService,
    private readonly openrouter: OpenrouterService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Analyze collected research data for a startup idea and generate market insights.
   * Retrieves the prepared dataset from ResearchDataService, sends it to OpenRouter,
   * parses the structured JSON response, and stores the result in ResearchInsights.
   *
   * @param ideaId - The CUID of the startup idea to analyze
   * @returns InsightAnalysisResult containing the structured insights and storage record ID
   */
  async analyzeIdea(ideaId: string): Promise<InsightAnalysisResult> {
    this.logger.log(`Starting insight analysis for idea: ${ideaId}`);

    // 1. Retrieve prepared dataset from ResearchDataService
    const { dataset } = await this.researchData.prepareDatasetForAnalysis(
      ideaId,
      this.MAX_ENTRIES,
    );

    if (dataset.length === 0) {
      this.logger.warn(
        `No research data found for idea ${ideaId} — analysis will be based on empty dataset`,
      );
    }

    // 2. Enforce data limits: max 20 entries, each trimmed to 1500 chars
    const trimmedDataset = dataset
      .slice(0, this.MAX_ENTRIES)
      .map((entry) => entry.slice(0, this.MAX_ENTRY_CHARS));

    // 3. Attempt analysis with primary model, fall back on any error
    let insights: MarketInsights;
    let modelUsed: string;

    try {
      insights = await this.runAnalysis(trimmedDataset, this.PRIMARY_MODEL);
      modelUsed = this.PRIMARY_MODEL;
      this.logger.log(
        `Insight analysis succeeded with primary model (${this.PRIMARY_MODEL})`,
      );
    } catch (primaryError) {
      const primaryMsg =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      this.logger.warn(
        `Primary model failed (${primaryMsg}), retrying with fallback model`,
      );

      try {
        insights = await this.runAnalysis(trimmedDataset, this.FALLBACK_MODEL);
        modelUsed = this.FALLBACK_MODEL;
        this.logger.log(
          `Insight analysis succeeded with fallback model (${this.FALLBACK_MODEL})`,
        );
      } catch (fallbackError) {
        const fallbackMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        this.logger.error(
          `Both models failed for idea ${ideaId}: ${fallbackMsg}`,
        );
        throw new Error(`Insight analysis failed: ${fallbackMsg}`);
      }
    }

    // 4. Store insights and return result
    const storedInsightId = await this.storeInsights(
      ideaId,
      insights,
      modelUsed,
    );

    this.logger.log(
      `Insight analysis complete for idea ${ideaId}: demandScore=${insights.demandScore}`,
    );

    return { ideaId, insights, modelUsed, storedInsightId };
  }

  private async runAnalysis(
    dataset: string[],
    model: string,
  ): Promise<MarketInsights> {
    const prompt = this.buildAnalysisPrompt(dataset);
    const response = await this.openrouter.sendPrompt(prompt, model);
    return this.parseInsightsResponse(response);
  }

  private buildAnalysisPrompt(dataset: string[]): string {
    const formattedData =
      dataset.length > 0
        ? dataset.map((entry, i) => `[${i + 1}] ${entry}`).join('\n\n')
        : '(No research data available — base analysis on general knowledge)';

    return `You are a startup market researcher analyzing online discussions and articles to evaluate a business opportunity.

RESEARCH DATA:
${formattedData}

Your task is to analyze the content above and extract structured market insights.

Instructions:
- Read all provided data entries carefully
- Identify recurring pain points and problems mentioned by users
- Detect any existing software tools, products, or companies referenced as solutions
- Evaluate overall market demand based on the frequency and urgency of the problems discussed
- Summarize the business opportunity in one concise paragraph

Scoring guidance for demandScore (1–10):
- 1–3: Niche problem, few mentions, low urgency
- 4–6: Moderate demand, some discussion, clear but not urgent pain points
- 7–9: High demand, frequent complaints, strong urgency across sources
- 10: Viral pain point, widespread frustration, clearly underserved market

Return ONLY a valid JSON object in this exact format with no additional text or markdown:
{
  "demandScore": <number between 1 and 10>,
  "problems": ["problem 1", "problem 2", "problem 3"],
  "competitors": ["tool or company 1", "tool or company 2"],
  "opportunitySummary": "<one paragraph describing the opportunity>"
}`;
  }

  private parseInsightsResponse(response: string): MarketInsights {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in model response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Model response contained malformed JSON');
    }

    const obj = parsed as Record<string, unknown>;

    if (
      typeof obj.demandScore !== 'number' ||
      !Array.isArray(obj.problems) ||
      !Array.isArray(obj.competitors) ||
      typeof obj.opportunitySummary !== 'string'
    ) {
      throw new Error(
        'Invalid insight structure: expected demandScore, problems, competitors, opportunitySummary',
      );
    }

    return {
      demandScore: Math.min(10, Math.max(1, Math.round(obj.demandScore))),
      problems: (obj.problems as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      ),
      competitors: (obj.competitors as unknown[]).filter(
        (c): c is string => typeof c === 'string',
      ),
      opportunitySummary: obj.opportunitySummary.trim(),
    };
  }

  private async storeInsights(
    ideaId: string,
    insights: MarketInsights,
    modelUsed: string,
  ): Promise<string> {
    const record = await this.prisma.researchInsights.upsert({
      where: { idea_id: ideaId },
      create: {
        idea_id: ideaId,
        demand_score: insights.demandScore,
        problems: JSON.stringify(insights.problems),
        competitors: JSON.stringify(insights.competitors),
        opportunity_summary: insights.opportunitySummary,
        model_used: modelUsed,
      },
      update: {
        demand_score: insights.demandScore,
        problems: JSON.stringify(insights.problems),
        competitors: JSON.stringify(insights.competitors),
        opportunity_summary: insights.opportunitySummary,
        model_used: modelUsed,
        updated_at: new Date(),
      },
    });

    this.logger.log(
      `Stored ResearchInsights for idea ${ideaId}, record id: ${record.id}`,
    );
    return record.id;
  }
}
