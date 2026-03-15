import { Injectable, Logger } from '@nestjs/common';
import { SearchResult, SearchService } from './search.service';

interface RankedSearchResult extends SearchResult {
  rankScore: number;
}

@Injectable()
export class SearchOrchestratorService {
  private readonly logger = new Logger(SearchOrchestratorService.name);
  private readonly MAX_RESULTS = 20;
  private readonly SOURCE_RELIABILITY: Record<SearchResult['source'], number> =
    {
      hackernews: 1.0,
      reddit: 0.9,
    };

  constructor(private readonly searchService: SearchService) {}

  async orchestrateSearch(queries: string[]): Promise<SearchResult[]> {
    if (!queries || queries.length === 0) {
      return [];
    }

    try {
      this.logger.log(`Orchestrating search for ${queries.length} queries`);

      const perQueryResults = await Promise.all(
        queries.map((query) => this.searchAcrossSources(query)),
      );

      const merged = perQueryResults.flat();
      const deduplicated = this.deduplicateByUrl(merged);
      const ranked = this.rankResults(deduplicated, queries);

      return ranked
        .slice(0, this.MAX_RESULTS)
        .map(({ rankScore, ...result }) => result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Search orchestration failed: ${message}`);
      return [];
    }
  }

  private async searchAcrossSources(query: string): Promise<SearchResult[]> {
    const connectors = [
      {
        name: 'hackernews',
        execute: () => this.searchService.searchHackerNews(query),
      },
      {
        name: 'reddit',
        execute: () => this.searchService.searchReddit(query),
      },
    ];

    const settled = await Promise.allSettled(
      connectors.map((connector) => connector.execute()),
    );

    const results: SearchResult[] = [];

    settled.forEach((outcome, index) => {
      const connectorName = connectors[index].name;

      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
        return;
      }

      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);

      this.logger.warn(
        `Connector ${connectorName} failed for query "${query}": ${reason}`,
      );
    });

    return results;
  }

  private deduplicateByUrl(results: SearchResult[]): SearchResult[] {
    const map = new Map<string, SearchResult>();

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);
      const existing = map.get(normalizedUrl);

      if (!existing) {
        map.set(normalizedUrl, result);
        continue;
      }

      if (result.score > existing.score) {
        map.set(normalizedUrl, result);
      }
    }

    return Array.from(map.values());
  }

  private rankResults(
    results: SearchResult[],
    queries: string[],
  ): RankedSearchResult[] {
    return results
      .map((result) => {
        const relevance = this.computeRelevance(result, queries);
        const reliability = this.SOURCE_RELIABILITY[result.source] ?? 0.5;

        const rankScore =
          result.score * 0.7 + relevance * 20 + reliability * 10;

        return {
          ...result,
          rankScore,
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  private computeRelevance(result: SearchResult, queries: string[]): number {
    const haystack = `${result.title} ${result.url}`.toLowerCase();

    let matches = 0;
    let totalTerms = 0;

    for (const query of queries) {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2);

      totalTerms += terms.length;

      for (const term of terms) {
        if (haystack.includes(term)) {
          matches += 1;
        }
      }
    }

    if (totalTerms === 0) {
      return 0;
    }

    return matches / totalTerms;
  }

  private normalizeUrl(url: string): string {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}
