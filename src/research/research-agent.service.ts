import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenrouterService } from '../openrouter/openrouter.service';
import { QueryGenerationService } from './query-generation.service';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { ScraperService } from './scraper.service';
import {
  ResearchDataService,
  ScrapedResearchInput,
} from './research-data.service';
import {
  InsightAnalysisService,
  InsightAnalysisResult,
} from './insight-analysis.service';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface AgentIterationSummary {
  iteration: number;
  queriesUsed: string[];
  searchResultsFound: number;
  pagesScraped: number;
  dataStored: number;
  continueResearch: boolean;
  nextQueries: string[];
}

export interface ResearchAgentResult {
  ideaId: string;
  totalIterations: number;
  iterations: AgentIterationSummary[];
  finalInsights: InsightAnalysisResult;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface DecisionPayload {
  continueResearch: boolean;
  nextQueries: string[];
}

@Injectable()
export class ResearchAgentService {
  private readonly logger = new Logger(ResearchAgentService.name);

  /** Hard cap on research loops to prevent runaway costs. */
  private readonly MAX_ITERATIONS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openrouter: OpenrouterService,
    private readonly queryGeneration: QueryGenerationService,
    private readonly searchOrchestrator: SearchOrchestratorService,
    private readonly scraper: ScraperService,
    private readonly researchData: ResearchDataService,
    private readonly insightAnalysis: InsightAnalysisService,
  ) {}

  /**
   * Run the AI research agent loop for the given idea.
   *
   * The loop:
   *  1. Fetches the idea from the database.
   *  2. Generates initial queries from the idea title/description.
   *  3. For each iteration:
   *     a. Runs the full research pipeline (search → scrape → store).
   *     b. Asks the LLM whether to continue and what to research next.
   *     c. If the LLM says stop (or max iterations reached), exits the loop.
   *  4. Runs InsightAnalysisService over all accumulated data.
   *  5. Returns a structured result with per-iteration summaries.
   */
  async runAgentLoop(ideaId: string): Promise<ResearchAgentResult> {
    this.logger.log(`Agent loop starting for idea ${ideaId}`);

    // ── 0. Load idea ──────────────────────────────────────────────────────────
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      select: { title: true, description: true, industry: true },
    });

    if (!idea) {
      throw new NotFoundException(`Idea ${ideaId} not found`);
    }

    // ── 1. Seed queries from the idea itself ──────────────────────────────────
    let currentQueries = await this.generateInitialQueries(idea);

    const iterationSummaries: AgentIterationSummary[] = [];

    // ── 2. Research loop ──────────────────────────────────────────────────────
    for (let i = 1; i <= this.MAX_ITERATIONS; i++) {
      this.logger.log(
        `Agent iteration ${i}/${this.MAX_ITERATIONS} — queries: [${currentQueries.join(', ')}]`,
      );

      let summary: AgentIterationSummary = {
        iteration: i,
        queriesUsed: currentQueries,
        searchResultsFound: 0,
        pagesScraped: 0,
        dataStored: 0,
        continueResearch: false,
        nextQueries: [],
      };

      try {
        summary = await this.runIteration(
          ideaId,
          i,
          currentQueries,
          idea.title,
        );
      } catch (iterError) {
        const msg =
          iterError instanceof Error ? iterError.message : String(iterError);
        this.logger.warn(
          `Iteration ${i} failed (${msg}), continuing to next iteration`,
        );
        iterationSummaries.push({ ...summary, continueResearch: true });
        continue;
      }

      iterationSummaries.push(summary);

      // Stop if this was the last iteration or the LLM said to stop
      if (i === this.MAX_ITERATIONS || !summary.continueResearch) {
        this.logger.log(
          `Agent loop ending after iteration ${i} (continueResearch=${summary.continueResearch})`,
        );
        break;
      }

      // Advance to next iteration with LLM-suggested queries
      currentQueries = summary.nextQueries;
    }

    // ── 3. Final analysis over all accumulated data ───────────────────────────
    this.logger.log(
      `Running final insight analysis for idea ${ideaId} after ${iterationSummaries.length} iterations`,
    );

    const finalInsights = await this.insightAnalysis.analyzeIdea(ideaId);

    this.logger.log(
      `Agent loop complete for idea ${ideaId} — demandScore: ${finalInsights.insights.demandScore}`,
    );

    return {
      ideaId,
      totalIterations: iterationSummaries.length,
      iterations: iterationSummaries,
      finalInsights,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Run a single full research pipeline iteration.
   */
  private async runIteration(
    ideaId: string,
    iteration: number,
    queries: string[],
    ideaTitle: string,
  ): Promise<AgentIterationSummary> {
    // a. Search
    const searchResults =
      await this.searchOrchestrator.orchestrateSearch(queries);
    this.logger.log(
      `Iteration ${iteration}: ${searchResults.length} search results`,
    );

    // b. Scrape
    const scraped = await this.scraper.scrapeMultiple(searchResults);
    this.logger.log(`Iteration ${iteration}: ${scraped.length} pages scraped`);

    // c. Store
    const entries: ScrapedResearchInput[] = scraped.map((s) => ({
      source: s.source,
      title: s.title,
      url: s.url,
      content: s.content,
    }));

    const storeResult = await this.researchData.storeScrapedContent(
      ideaId,
      entries,
    );
    this.logger.log(
      `Iteration ${iteration}: stored ${storeResult.stored} entries (${storeResult.skippedDuplicate} duplicates skipped)`,
    );

    // d. AI decision: continue or stop?
    const decision = await this.askAgentDecision(
      ideaTitle,
      iteration,
      scraped.map((s) => s.title).filter(Boolean),
      queries,
    );

    return {
      iteration,
      queriesUsed: queries,
      searchResultsFound: searchResults.length,
      pagesScraped: scraped.length,
      dataStored: storeResult.stored,
      continueResearch: decision.continueResearch,
      nextQueries: decision.nextQueries,
    };
  }

  /**
   * Generate seed queries for the first iteration using QueryGenerationService.
   * Falls back to a minimal set of keyword queries on failure.
   */
  private async generateInitialQueries(idea: {
    title: string;
    description: string | null;
    industry: string | null;
  }): Promise<string[]> {
    try {
      return await this.queryGeneration.generateQueries({
        title: idea.title,
        description: idea.description ?? undefined,
        industry: idea.industry ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Initial query generation failed (${msg}), using title as fallback query`,
      );
      return [idea.title];
    }
  }

  /**
   * Ask the LLM whether the research loop should continue and what to focus on next.
   * Falls back to `continueResearch: false` on any error so the loop always terminates.
   */
  private async askAgentDecision(
    ideaTitle: string,
    currentIteration: number,
    recentTitles: string[],
    currentQueries: string[],
  ): Promise<DecisionPayload> {
    const prompt = this.buildDecisionPrompt(
      ideaTitle,
      currentIteration,
      recentTitles,
      currentQueries,
    );

    try {
      const response = await this.openrouter.sendPrompt(prompt);
      return this.parseDecisionResponse(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Agent decision LLM call failed (${msg}) — defaulting to stop`,
      );
      return { continueResearch: false, nextQueries: [] };
    }
  }

  private buildDecisionPrompt(
    ideaTitle: string,
    iteration: number,
    recentTitles: string[],
    currentQueries: string[],
  ): string {
    const titlesBlock =
      recentTitles.length > 0
        ? recentTitles
            .slice(0, 10)
            .map((t) => `- ${t}`)
            .join('\n')
        : '(no titles collected)';

    return `You are an AI research assistant helping evaluate a startup idea.

STARTUP IDEA: "${ideaTitle}"
CURRENT ITERATION: ${iteration}
QUERIES USED THIS ITERATION: ${currentQueries.map((q) => `"${q}"`).join(', ')}

RECENTLY COLLECTED ARTICLE TITLES:
${titlesBlock}

Based on what has been collected so far, decide whether additional research would meaningfully improve the analysis.

Rules:
- If important topics are still uncovered (competitors, pricing, customer pain points) suggest up to 3 focused queries.
- If enough data has been gathered return continueResearch: false.
- Always suggest competitor-focused queries on iteration 1.
- Keep suggested queries specific and actionable.

Return ONLY a valid JSON object with no explanation:
{
  "continueResearch": <true or false>,
  "nextQueries": ["query 1", "query 2"]
}`;
  }

  private parseDecisionResponse(response: string): DecisionPayload {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in decision response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Malformed JSON in decision response');
    }

    const obj = parsed as Record<string, unknown>;

    const continueResearch =
      typeof obj.continueResearch === 'boolean' ? obj.continueResearch : false;

    const nextQueries = Array.isArray(obj.nextQueries)
      ? (obj.nextQueries as unknown[]).filter(
          (q): q is string => typeof q === 'string' && q.trim().length > 0,
        )
      : [];

    return { continueResearch, nextQueries };
  }
}
