import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorMemoryService } from './vector-memory.service';

export interface ScrapedResearchInput {
  source: string;
  title?: string;
  url: string;
  content: string;
}

export interface StoreResearchDataResult {
  received: number;
  stored: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  failed: number;
}

export interface PreparedResearchDataset {
  ideaId: string;
  dataset: string[];
}

@Injectable()
export class ResearchDataService {
  private readonly logger = new Logger(ResearchDataService.name);
  private readonly MIN_CONTENT_LENGTH = 100;
  private readonly MAX_CONTENT_LENGTH = 2000;
  private readonly DEFAULT_DATASET_LIMIT = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorMemory: VectorMemoryService,
  ) {}

  async storeScrapedContent(
    ideaId: string,
    entries: ScrapedResearchInput[],
  ): Promise<StoreResearchDataResult> {
    const result: StoreResearchDataResult = {
      received: entries?.length ?? 0,
      stored: 0,
      skippedInvalid: 0,
      skippedDuplicate: 0,
      failed: 0,
    };

    if (!entries || entries.length === 0) {
      return result;
    }

    for (const entry of entries) {
      try {
        const cleaned = this.cleanEntry(entry);

        if (!cleaned) {
          result.skippedInvalid += 1;
          continue;
        }

        const duplicate = await this.prisma.researchData.findFirst({
          where: {
            idea_id: ideaId,
            source_url: cleaned.url,
          },
          select: {
            id: true,
          },
        });

        if (duplicate) {
          result.skippedDuplicate += 1;
          continue;
        }

        const created = await this.prisma.researchData.create({
          data: {
            idea_id: ideaId,
            source_type: cleaned.source,
            source_name: cleaned.source,
            source_url: cleaned.url,
            data_type: 'article',
            title: cleaned.title,
            content: cleaned.content,
          },
          select: {
            id: true,
          },
        });

        // Embedding failures should never break ingestion.
        try {
          await this.vectorMemory.generateAndStoreEmbedding(
            created.id,
            cleaned.content,
          );
        } catch (embeddingError) {
          const embeddingMessage =
            embeddingError instanceof Error
              ? embeddingError.message
              : String(embeddingError);
          this.logger.warn(
            `Embedding generation failed for research entry ${created.id}: ${embeddingMessage}`,
          );
        }

        result.stored += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to store research entry for idea ${ideaId}: ${message}`,
        );
      }
    }

    return result;
  }

  async prepareDatasetForAnalysis(
    ideaId: string,
    limit = this.DEFAULT_DATASET_LIMIT,
  ): Promise<PreparedResearchDataset> {
    const safeLimit = Math.max(1, Math.min(limit, this.DEFAULT_DATASET_LIMIT));

    const rows = await this.prisma.researchData.findMany({
      where: {
        idea_id: ideaId,
      },
      select: {
        content: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: safeLimit * 3,
    });

    const dataset = rows
      .map((row) => this.cleanContent(row.content))
      .filter((content): content is string => Boolean(content))
      .slice(0, safeLimit);

    return {
      ideaId,
      dataset,
    };
  }

  private cleanEntry(entry: ScrapedResearchInput): ScrapedResearchInput | null {
    if (!entry || !entry.url) {
      return null;
    }

    const content = this.cleanContent(entry.content);
    if (!content) {
      return null;
    }

    return {
      source: (entry.source || 'unknown').trim().toLowerCase(),
      title: entry.title?.trim() || undefined,
      url: entry.url.trim(),
      content,
    };
  }

  private cleanContent(content: string | null | undefined): string | null {
    if (!content) {
      return null;
    }

    const normalized = content.trim();

    if (!normalized || normalized.length < this.MIN_CONTENT_LENGTH) {
      return null;
    }

    return normalized.substring(0, this.MAX_CONTENT_LENGTH);
  }
}
