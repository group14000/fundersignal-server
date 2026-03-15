import { Injectable, Logger } from '@nestjs/common';
import { get } from 'https';

export interface SearchResult {
  source: 'hackernews' | 'reddit';
  title: string;
  url: string;
  score: number;
  author?: string;
  created_at?: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  /**
   * Search multiple sources for URLs related to given queries
   * @param queries - Array of search queries
   * @returns Array of normalized search results with URLs
   */
  async searchQueries(queries: string[]): Promise<SearchResult[]> {
    if (!queries || queries.length === 0) {
      return [];
    }

    this.logger.log(`Searching ${queries.length} queries across sources`);

    const results: SearchResult[] = [];

    // Execute searches in parallel, but handle individual failures
    const searchPromises = queries.map((query) =>
      this.searchQuery(query).catch((error) => {
        this.logger.warn(`Failed to search for "${query}": ${error.message}`);
        return [] as SearchResult[];
      }),
    );

    const allResults = await Promise.all(searchPromises);

    // Flatten and deduplicate by URL
    const urlMap = new Map<string, SearchResult>();
    allResults.forEach((queryResults) => {
      queryResults.forEach((result) => {
        if (!urlMap.has(result.url)) {
          urlMap.set(result.url, result);
        }
      });
    });

    return Array.from(urlMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Search a single query across all sources
   * @param query - Single search query
   * @returns Array of search results
   */
  private async searchQuery(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Try HackerNews
    try {
      const hnResults = await this.searchHackerNews(query);
      results.push(...hnResults);
    } catch (error) {
      this.logger.warn(
        `HackerNews search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Try Reddit
    try {
      const redditResults = await this.searchReddit(query);
      results.push(...redditResults);
    } catch (error) {
      this.logger.warn(
        `Reddit search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return results;
  }

  /**
   * Search HackerNews for articles related to query
   * Uses Algolia API which indexes HackerNews content
   */
  async searchHackerNews(query: string): Promise<SearchResult[]> {
    const url = new URL('https://hn.algolia.com/api/v1/search');
    url.searchParams.append('query', query);
    url.searchParams.append('numericFilters', 'points>10'); // Filter for quality posts
    url.searchParams.append('hitsPerPage', '10');

    try {
      const response = await this.fetchJson<{
        hits: Array<{
          objectID: string;
          title: string;
          url: string;
          points: number;
          author: string;
          created_at: string;
        }>;
      }>(url.toString());

      if (!response.hits) {
        return [];
      }

      return response.hits
        .filter((hit) => hit.url && hit.title) // Only include items with URL
        .map((hit) => ({
          source: 'hackernews' as const,
          title: hit.title,
          url: this.normalizeHNUrl(hit),
          score: hit.points || 0,
          author: hit.author || 'unknown',
          created_at: hit.created_at,
        }));
    } catch (error) {
      this.logger.debug(`HackerNews fetch failed: ${error}`);
      throw error;
    }
  }

  /**
   * Search Reddit for discussions related to query
   */
  async searchReddit(query: string): Promise<SearchResult[]> {
    const url = new URL('https://www.reddit.com/search.json');
    url.searchParams.append('q', query);
    url.searchParams.append('type', 'link');
    url.searchParams.append('sort', 'relevance');
    url.searchParams.append('limit', '10');
    url.searchParams.append('t', 'all'); // Search all time

    try {
      const response = await this.fetchJson<{
        data: {
          children: Array<{
            data: {
              title: string;
              url: string;
              score: number;
              author: string;
              created_utc: number;
              permalink: string;
            };
          }>;
        };
      }>(url.toString(), {
        'User-Agent': 'FounderSignal/1.0 (+http://localhost:5000) research bot',
      });

      if (!response.data || !response.data.children) {
        return [];
      }

      return response.data.children
        .map((child) => child.data)
        .filter((data) => data.url && data.title)
        .map((data) => ({
          source: 'reddit' as const,
          title: data.title,
          url: data.url,
          score: data.score || 0,
          author: data.author || 'unknown',
          created_at: new Date(data.created_utc * 1000).toISOString(),
        }));
    } catch (error) {
      this.logger.debug(`Reddit fetch failed: ${error}`);
      throw error;
    }
  }

  /**
   * Normalize HackerNews URL to direct link if available
   */
  private normalizeHNUrl(hit: any): string {
    // HackerNews items have a URL field, but if it's missing, use the discussion link
    if (hit.url && !hit.url.startsWith('item?')) {
      return hit.url;
    }
    // Fall back to HN discussion page
    return `https://news.ycombinator.com/item?id=${hit.objectID}`;
  }

  /**
   * Generic HTTP fetch with JSON parsing
   */
  private fetchJson<T>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestHeaders = {
        Accept: 'application/json',
        ...headers,
      };

      const request = get(url, { headers: requestHeaders }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            if (response.statusCode === 200 || response.statusCode === 206) {
              resolve(JSON.parse(data));
            } else {
              reject(
                new Error(
                  `HTTP ${response.statusCode}: ${data.substring(0, 100)}`,
                ),
              );
            }
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(10000);
    });
  }
}
