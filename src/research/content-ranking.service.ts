import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RankedEntry {
  id: string;
  url: string;
  content: string;
  title: string | null;
  source: string;
  relevanceScore: number;
}

export interface RankedDatasetResult {
  ideaId: string;
  totalCandidates: number;
  filtered: number;
  topEntries: RankedEntry[];
  /** Ready-to-use string array for the LLM — top entries, content only */
  dataset: string[];
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface RawEntry {
  id: string;
  source_type: string;
  source_url: string | null;
  title: string | null;
  content: string;
}

@Injectable()
export class ContentRankingService {
  private readonly logger = new Logger(ContentRankingService.name);

  /** Minimum content length in characters — shorter entries are noise */
  private readonly MIN_CONTENT_LENGTH = 100;
  /** Minimum relevance score to survive filtering */
  private readonly MIN_RELEVANCE_SCORE = 0.1;
  /** Number of top entries to return */
  private readonly TOP_N = 10;
  /** Fallback pool size when ranking fails */
  private readonly FALLBACK_LIMIT = 10;

  // ── Scoring weights (must sum to 1.0) ──────────────────────────────────────
  private readonly W_SOURCE = 0.15;
  private readonly W_LENGTH = 0.15;
  private readonly W_KEYWORD = 0.4;
  private readonly W_PROBLEM = 0.2;
  private readonly W_COMPETITOR = 0.1;

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  private readonly PROBLEM_SIGNALS = [
    'problem',
    'issue',
    'complaint',
    'frustrat',
    'pain',
    'struggle',
    'annoying',
    'broken',
    'fail',
    'lack',
    'missing',
    'hard to',
    'difficult',
    'no solution',
    "can't",
    'cannot',
    'impossible',
    'tedious',
    'manual',
    'outdated',
    'expensive',
    'slow',
  ];

  private readonly COMPETITOR_SIGNALS = [
    'alternative',
    'competitor',
    ' vs ',
    ' versus ',
    'compared to',
    'instead of',
    'better than',
    'switch from',
    'replace',
    'similar to',
    'tool',
    'software',
    'platform',
    'app',
    'service',
    'product',
    'saas',
    'solution',
  ];

  private readonly SOURCE_WEIGHTS: Record<string, number> = {
    hackernews: 1.0,
    reddit: 0.9,
    producthunt: 0.85,
    google: 0.75,
    twitter: 0.7,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score and rank all stored research entries for a given idea.
   * Returns the top N most relevant entries as a ready-to-use string dataset.
   *
   * Falls back to the most recent FALLBACK_LIMIT entries if ranking fails.
   */
  async getRankedDataset(ideaId: string): Promise<RankedDatasetResult> {
    try {
      return await this.rank(ideaId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Ranking failed for idea ${ideaId} (${msg}), falling back to most recent entries`,
      );
      return this.fallback(ideaId);
    }
  }

  // ─── Core ranking ─────────────────────────────────────────────────────────

  private async rank(ideaId: string): Promise<RankedDatasetResult> {
    // 1. Fetch idea title for keyword extraction
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      select: { title: true, description: true },
    });

    const keywords = this.extractKeywords(
      `${idea?.title ?? ''} ${idea?.description ?? ''}`,
    );

    // 2. Fetch all research entries for the idea
    const rows = await this.prisma.researchData.findMany({
      where: { idea_id: ideaId },
      select: {
        id: true,
        source_type: true,
        source_url: true,
        title: true,
        content: true,
      },
      orderBy: { created_at: 'desc' },
    });

    this.logger.log(
      `Ranking ${rows.length} candidates for idea ${ideaId} (keywords: [${keywords.join(', ')}])`,
    );

    // 3. Filter & score
    const scored: RankedEntry[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      // Content length gate
      if (!row.content || row.content.length < this.MIN_CONTENT_LENGTH) {
        continue;
      }

      // URL-level deduplication
      const url = row.source_url ?? row.id;
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);

      const score = this.scoreEntry(row, keywords);

      // Relevance gate
      if (score < this.MIN_RELEVANCE_SCORE) {
        continue;
      }

      scored.push({
        id: row.id,
        url,
        content: row.content,
        title: row.title,
        source: row.source_type,
        relevanceScore: score,
      });
    }

    // 4. Sort descending and take top N
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topEntries = scored.slice(0, this.TOP_N);

    this.logger.log(
      `Ranking complete: ${scored.length} passed filtering, returning top ${topEntries.length}`,
    );

    return {
      ideaId,
      totalCandidates: rows.length,
      filtered: rows.length - scored.length,
      topEntries,
      dataset: topEntries.map((e) => e.content),
    };
  }

  // ─── Scoring ──────────────────────────────────────────────────────────────

  private scoreEntry(row: RawEntry, keywords: string[]): number {
    const text = `${row.title ?? ''} ${row.content}`.toLowerCase();

    return (
      this.scoreSource(row.source_type) +
      this.scoreLength(row.content) +
      this.scoreKeywords(text, keywords) +
      this.scoreProblemSignals(text) +
      this.scoreCompetitorSignals(text)
    );
  }

  /**
   * Source credibility — known sources earn full weight.
   * Max: W_SOURCE (0.15)
   */
  private scoreSource(sourceType: string): number {
    const reliability = this.SOURCE_WEIGHTS[sourceType.toLowerCase()] ?? 0.6;
    return reliability * this.W_SOURCE;
  }

  /**
   * Content length — rewards substantive entries up to ~2000 chars.
   * Max: W_LENGTH (0.15)
   */
  private scoreLength(content: string): number {
    const len = content.length;
    let lengthRatio: number;
    if (len < 100) lengthRatio = 0;
    else if (len < 300) lengthRatio = 0.25;
    else if (len < 700) lengthRatio = 0.5;
    else if (len < 1500) lengthRatio = 0.85;
    else lengthRatio = 1.0;

    return lengthRatio * this.W_LENGTH;
  }

  /**
   * Keyword relevance — how many idea keywords appear in the entry.
   * Max: W_KEYWORD (0.40)
   */
  private scoreKeywords(text: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const hits = keywords.filter((kw) => text.includes(kw)).length;
    // Saturate at 60% keyword hit-rate to avoid gaming with short queries
    const ratio = Math.min(hits / Math.max(keywords.length * 0.6, 1), 1);
    return ratio * this.W_KEYWORD;
  }

  /**
   * Problem signal presence — entries describing pain points are valuable.
   * Max: W_PROBLEM (0.20)
   */
  private scoreProblemSignals(text: string): number {
    const hits = this.PROBLEM_SIGNALS.filter((s) => text.includes(s)).length;
    // Saturate at 4 distinct signals
    const ratio = Math.min(hits / 4, 1);
    return ratio * this.W_PROBLEM;
  }

  /**
   * Competitor signal presence — entries mentioning tools/competitors are valuable.
   * Max: W_COMPETITOR (0.10)
   */
  private scoreCompetitorSignals(text: string): number {
    const hits = this.COMPETITOR_SIGNALS.filter((s) => text.includes(s)).length;
    // Saturate at 3 distinct signals
    const ratio = Math.min(hits / 3, 1);
    return ratio * this.W_COMPETITOR;
  }

  // ─── Keyword extraction ───────────────────────────────────────────────────

  /**
   * Extracts meaningful words from the idea title and description,
   * removing common English stop-words.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'a',
      'an',
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'that',
      'this',
      'it',
      'its',
      'we',
      'our',
      'my',
      'your',
      'their',
      'i',
      'you',
      'he',
      'she',
      'they',
      'not',
      'no',
      'so',
      'as',
      'if',
      'how',
      'what',
      'when',
      'where',
      'who',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // deduplicate
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────

  private async fallback(ideaId: string): Promise<RankedDatasetResult> {
    const rows = await this.prisma.researchData.findMany({
      where: {
        idea_id: ideaId,
        content: { not: '' },
      },
      select: {
        id: true,
        source_type: true,
        source_url: true,
        title: true,
        content: true,
      },
      orderBy: { created_at: 'desc' },
      take: this.FALLBACK_LIMIT,
    });

    const entries: RankedEntry[] = rows
      .filter((r) => r.content.length >= this.MIN_CONTENT_LENGTH)
      .map((r) => ({
        id: r.id,
        url: r.source_url ?? r.id,
        content: r.content,
        title: r.title,
        source: r.source_type,
        relevanceScore: 0,
      }));

    return {
      ideaId,
      totalCandidates: rows.length,
      filtered: 0,
      topEntries: entries,
      dataset: entries.map((e) => e.content),
    };
  }
}
