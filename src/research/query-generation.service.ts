import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from '../openrouter/openrouter.service';

interface IdeaInput {
  title: string;
  description?: string;
  industry?: string;
}

interface QueryGenerationResult {
  queries: string[];
}

@Injectable()
export class QueryGenerationService {
  private readonly logger = new Logger(QueryGenerationService.name);

  constructor(private readonly openrouter: OpenrouterService) {}

  /**
   * Generate search queries from a startup idea using AI
   * @param idea - The startup idea object
   * @returns Array of 5-8 search queries optimized for market research
   */
  async generateQueries(idea: IdeaInput): Promise<string[]> {
    this.logger.log(`Generating queries for idea: ${idea.title}`);

    try {
      const prompt = this.buildQueryPrompt(idea);
      const response = await this.openrouter.sendPrompt(prompt);

      // Parse AI response
      const queries = this.parseQueryResponse(response);

      this.logger.log(
        `Successfully generated ${queries.length} AI queries via OpenRouter`,
        { queries },
      );
      return queries;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AI query generation failed (${errorMsg}), falling back to keyword extraction`,
      );

      // Fallback to simple keyword extraction
      return this.fallbackQueryGeneration(idea);
    }
  }

  /**
   * Build the LLM prompt for query generation
   */
  private buildQueryPrompt(idea: IdeaInput): string {
    const industryContext = idea.industry ? `\nINDUSTRY: ${idea.industry}` : '';

    return `You are a market researcher helping analyze startup ideas.

STARTUP IDEA:
TITLE: ${idea.title}
DESCRIPTION: ${idea.description || 'Not provided'}${industryContext}

Your task is to generate 5 to 8 search queries that would help research this startup idea.

The queries should focus on:
- Market problems this idea solves
- Existing competitors and alternatives
- Related tools and software
- Industry discussions and pain points
- Target customer needs

Generate queries that work well for:
- Reddit discussions
- Hacker News posts
- Product Hunt products
- Google search results

Return ONLY a valid JSON object in this exact format:
{
  "queries": [
    "query 1 here",
    "query 2 here",
    "query 3 here",
    "query 4 here",
    "query 5 here"
  ]
}

Make queries specific, actionable, and relevant to market research.`;
  }

  /**
   * Parse the AI response and extract queries
   */
  private parseQueryResponse(response: string): string[] {
    try {
      // Extract JSON from response (handles cases where model adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed: QueryGenerationResult = JSON.parse(jsonMatch[0]);

      // Validate response structure
      if (!parsed.queries || !Array.isArray(parsed.queries)) {
        throw new Error('Invalid queries format in response');
      }

      // Filter out empty queries and ensure we have at least some results
      const validQueries = parsed.queries
        .filter((q) => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim());

      if (validQueries.length === 0) {
        throw new Error('No valid queries in response');
      }

      // Limit to 8 queries maximum
      return validQueries.slice(0, 8);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse query response: ${message}`);
      throw error;
    }
  }

  /**
   * Fallback query generation if AI fails
   * Extracts simple keywords from title and description
   */
  private fallbackQueryGeneration(idea: IdeaInput): string[] {
    this.logger.warn('Using fallback query generation');

    const keywords: string[] = [];

    // Extract from title
    if (idea.title) {
      keywords.push(idea.title.toLowerCase());

      // Add "problems" variant
      keywords.push(`${idea.title} problems`);

      // Add "alternatives" variant
      keywords.push(`${idea.title} alternatives`);
    }

    // Extract from description if available
    if (idea.description) {
      // Take first sentence or first 50 chars
      const snippet = idea.description.split('.')[0].substring(0, 50);
      keywords.push(snippet.toLowerCase());
    }

    // Add industry-specific query if available
    if (idea.industry) {
      keywords.push(`${idea.industry} software tools`);
      keywords.push(`${idea.industry} market problems`);
    }

    // Add generic research queries
    keywords.push('market research startup validation');

    // Return unique queries (max 8)
    return [...new Set(keywords)].slice(0, 8);
  }

  /**
   * Generate queries with custom options
   * @param idea - The startup idea
   * @param options - Generation options
   */
  async generateQueriesWithOptions(
    idea: IdeaInput,
    options?: {
      count?: number; // Number of queries to generate (5-10)
      focus?: 'problems' | 'competitors' | 'general'; // Query focus
    },
  ): Promise<string[]> {
    const count = options?.count || 8;
    const focus = options?.focus || 'general';

    const prompt = this.buildCustomPrompt(idea, count, focus);

    try {
      const response = await this.openrouter.sendPrompt(prompt);
      const queries = this.parseQueryResponse(response);
      return queries.slice(0, count);
    } catch (error) {
      this.logger.error('Failed to generate custom queries', error);
      return this.fallbackQueryGeneration(idea);
    }
  }

  /**
   * Build custom prompt based on focus area
   */
  private buildCustomPrompt(
    idea: IdeaInput,
    count: number,
    focus: string,
  ): string {
    const focusInstructions = {
      problems: 'Focus heavily on user problems, pain points, and complaints.',
      competitors:
        'Focus on identifying competitors, alternatives, and market leaders.',
      general:
        'Balance between problems, competitors, tools, and market discussions.',
    };

    const instruction =
      focusInstructions[focus as keyof typeof focusInstructions] ||
      focusInstructions.general;

    return `You are a market researcher helping analyze startup ideas.

STARTUP IDEA:
TITLE: ${idea.title}
DESCRIPTION: ${idea.description || 'Not provided'}
INDUSTRY: ${idea.industry || 'Not specified'}

Generate exactly ${count} search queries for market research.
${instruction}

Return ONLY a valid JSON object:
{
  "queries": ["query1", "query2", ...]
}`;
  }
}
