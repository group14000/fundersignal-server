import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';

const ALLOWED_SCRAPE_DOMAINS = [
  'reddit.com',
  'www.reddit.com',
  'news.ycombinator.com',
  'ycombinator.com',
  'producthunt.com',
  'www.producthunt.com',
];

/** Returns true if the hostname resolves to a private/loopback/link-local range. */
function isPrivateHostname(hostname: string): boolean {
  // Reject obvious loopback / unspecified literals
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    return true;
  }

  // Match dotted-decimal IPv4 addresses
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    if (a === 127) return true; // 127.x.x.x loopback
    if (a === 10) return true; // 10.x.x.x private
    if (a === 169 && b === 254) return true; // 169.254.x.x link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31.x.x private
    if (a === 192 && b === 168) return true; // 192.168.x.x private
    if (a === 0) return true; // 0.x.x.x unspecified
  }

  return false;
}

export interface SearchResult {
  source: string;
  title: string;
  url: string;
  score?: number;
}

export interface ScrapedContent extends SearchResult {
  content: string;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger('ScraperService');
  private readonly axiosInstance: AxiosInstance;
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_CONTENT_LENGTH = 3000; // Characters
  private readonly MAX_URLS = 10;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: this.REQUEST_TIMEOUT,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Scrape content from multiple URLs, handling different sources
   */
  async scrapeMultiple(
    searchResults: SearchResult[],
  ): Promise<ScrapedContent[]> {
    const urlsToScrape = searchResults.slice(0, this.MAX_URLS);

    this.logger.log(`Starting to scrape ${urlsToScrape.length} URLs`);

    const settled = await Promise.allSettled(
      urlsToScrape.map((result) =>
        this.scrapeUrl(result.url, result.source).then((content) => ({
          ...result,
          content: content.trim(),
        })),
      ),
    );

    const results: ScrapedContent[] = [];
    for (const [i, outcome] of settled.entries()) {
      if (outcome.status === 'fulfilled') {
        this.logger.log(
          `Successfully scraped: ${urlsToScrape[i].source} - ${urlsToScrape[i].url}`,
        );
        results.push(outcome.value);
      } else {
        const msg =
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason);
        this.logger.warn(`Failed to scrape ${urlsToScrape[i].url}: ${msg}`);
      }
    }

    this.logger.log(
      `Scraping complete: ${results.length}/${urlsToScrape.length} succeeded`,
    );

    return results;
  }

  /**
   * Scrape a single URL with source-specific handling
   */
  private async scrapeUrl(url: string, source: string): Promise<string> {
    const html = await this.fetchHtml(url);

    // Detect content sources by domain
    if (url.includes('ycombinator.com')) {
      return this.extractYCombinatorContent(html);
    } else if (url.includes('news.ycombinator.com')) {
      return this.extractHackerNewsContent(html);
    }

    switch (source.toLowerCase()) {
      case 'hackernews':
        return this.extractHackerNewsContent(html);
      case 'reddit':
        return this.extractRedditContent(html);
      default:
        return this.extractGenericContent(html);
    }
  }

  /**
   * Validate that a URL's hostname is on the allowlist and not a private address.
   * Throws BadRequestException if validation fails.
   * Call this explicitly at trust boundaries (e.g. test/external endpoints)
   * before passing user-supplied URLs to scrapeMultiple().
   */
  validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('URL domain not allowed.');
    }

    if (isPrivateHostname(parsed.hostname)) {
      throw new BadRequestException('URL domain not allowed.');
    }

    if (!ALLOWED_SCRAPE_DOMAINS.includes(parsed.hostname)) {
      throw new BadRequestException('URL domain not allowed.');
    }
  }

  /**
   * Fetch HTML from URL
   */
  private async fetchHtml(url: string): Promise<string> {
    try {
      const response = await this.axiosInstance.get(url);
      return response.data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error(`Request timeout for ${url}`);
        }
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
      }
      throw new Error(`Failed to fetch ${url}`);
    }
  }

  /**
   * Extract content from HackerNews
   * Focus on comments and discussion
   */
  private extractHackerNewsContent(html: string): string {
    try {
      const $ = cheerio.load(html);
      const textContent: string[] = [];

      // Extract story title
      const title = $('span.titleline').text().trim();
      if (title) {
        textContent.push(title);
      }

      // Extract story metadata (points, comments count)
      const meta = $('span.score').text().trim();
      if (meta) {
        textContent.push(meta);
      }

      // Extract comments - main discussion content
      $('.commtext').each((_, elem) => {
        const commentText = $(elem).text().trim();
        if (commentText) {
          textContent.push(commentText);
        }
      });

      // Extract submission description if available
      const description = $('.toptext').text().trim();
      if (description) {
        textContent.push(description);
      }

      const combined = textContent.join('\n').trim();
      return combined
        ? combined.substring(0, this.MAX_CONTENT_LENGTH)
        : 'No content extracted';
    } catch (error) {
      this.logger.warn('Error extracting HackerNews content', error);
      return 'Failed to extract HackerNews content';
    }
  }

  /**
   * Extract content from Y Combinator blog articles
   * Focus on article body and key information
   */
  private extractYCombinatorContent(html: string): string {
    try {
      const $ = cheerio.load(html);
      const textContent: string[] = [];

      // Extract article title
      const title = $('h1').first().text().trim();
      if (title) {
        textContent.push(title);
      }

      // Extract article body - YC uses article tag
      const articleBody = $('article').text().trim();
      if (articleBody) {
        textContent.push(articleBody);
      }

      // Alternative: Look for main content in divs with id or class containing "content"
      if (textContent.length < 2) {
        const mainContent = $('[class*="content"], [id*="content"]')
          .first()
          .text()
          .trim();
        if (mainContent) {
          textContent.push(mainContent);
        }
      }

      // Extract paragraphs as fallback
      if (textContent.length < 2) {
        $('p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text && text.length > 50) {
            textContent.push(text);
          }
        });
      }

      const combined = textContent.join('\n').trim();
      return combined
        ? combined.substring(0, this.MAX_CONTENT_LENGTH)
        : 'No content extracted';
    } catch (error) {
      this.logger.warn('Error extracting Y Combinator content', error);
      return 'Failed to extract Y Combinator content';
    }
  }

  /**
   * Extract content from Reddit
   * Focus on post title, body, and top comments
   */
  private extractRedditContent(html: string): string {
    try {
      const $ = cheerio.load(html);
      const textContent: string[] = [];

      // Extract post title
      const title = $('h1, h2').first().text().trim();
      if (title) {
        textContent.push(title);
      }

      // Extract post body/description
      const postBody = $('[data-testid="post-container"]').text().trim();
      if (postBody) {
        textContent.push(postBody);
      }

      // Extract top comments
      $('[data-testid="comment"]')
        .slice(0, 5)
        .each((_, elem) => {
          const commentText = $(elem).text().trim();
          if (commentText && commentText.length > 20) {
            textContent.push(commentText);
          }
        });

      // Fallback: extract any paragraph text
      if (textContent.length < 2) {
        $('p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text && text.length > 50) {
            textContent.push(text);
          }
        });
      }

      const combined = textContent.join('\n').trim();
      return combined
        ? combined.substring(0, this.MAX_CONTENT_LENGTH)
        : 'No content extracted';
    } catch (error) {
      this.logger.warn('Error extracting Reddit content', error);
      return 'Failed to extract Reddit content';
    }
  }

  /**
   * Extract content from generic blogs/websites
   * Remove navigation, scripts, styles, and extract main article body
   */
  private extractGenericContent(html: string): string {
    try {
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $(
        'script, style, nav, footer, [role="navigation"], .navbar, .sidebar, .advertisement, .ad',
      ).remove();

      // Try to find main content areas
      let content = '';

      // Priority 1: article tag
      const articleContent = $('article').text().trim();
      if (articleContent) {
        content = articleContent;
      }

      // Priority 2: main tag
      if (!content) {
        const mainContent = $('main').text().trim();
        if (mainContent) {
          content = mainContent;
        }
      }

      // Priority 3: content divs
      if (!content) {
        const div = $('[class*="content"], [class*="post"], [class*="entry"]')
          .first()
          .text()
          .trim();
        if (div) {
          content = div;
        }
      }

      // Priority 4: extract from paragraphs and headings
      if (!content) {
        const text: string[] = [];
        $('h1, h2, h3, p').each((_, elem) => {
          const t = $(elem).text().trim();
          if (t && t.length > 20) {
            text.push(t);
          }
        });
        content = text.join('\n').trim();
      }

      // Cleanup: remove extra whitespace
      content = content.replace(/\s+/g, ' ').trim();

      return content
        ? content.substring(0, this.MAX_CONTENT_LENGTH)
        : 'No content extracted';
    } catch (error) {
      this.logger.warn('Error extracting generic content', error);
      return 'Failed to extract content';
    }
  }

  /**
   * Clean and normalize extracted content
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\n\n+/g, '\n') // Remove extra newlines
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .substring(0, this.MAX_CONTENT_LENGTH);
  }
}
