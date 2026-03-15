import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpenrouterService } from '../openrouter/openrouter.service';
import { PrismaService } from '../prisma/prisma.service';

export interface SimilarResearchResult {
  id: string;
  content: string;
  source_url: string | null;
  score: number;
}

@Injectable()
export class VectorMemoryService {
  private readonly logger = new Logger(VectorMemoryService.name);
  private readonly EMBEDDING_MODEL =
    'nvidia/llama-nemotron-embed-vl-1b-v2:free';
  private readonly EMBEDDING_DIMENSIONS = 1536;
  private readonly DEFAULT_LIMIT = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openrouter: OpenrouterService,
  ) {}

  /**
   * Generates and stores an embedding for an existing ResearchData row.
   * This is non-blocking for the pipeline: callers should catch errors and continue.
   */
  async generateAndStoreEmbedding(
    researchDataId: string,
    content: string,
  ): Promise<void> {
    const embedding = await this.generateEmbedding(content);
    const vectorLiteral = this.toVectorLiteral(embedding);

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "ResearchData"
        SET embedding = ${vectorLiteral}::vector
        WHERE id = ${researchDataId}
      `,
    );
  }

  /**
   * Generates an embedding vector for a text input using OpenRouter embeddings API.
   */
  async generateEmbedding(input: string): Promise<number[]> {
    const client = this.openrouter.getClient();

    const response = await client.embeddings.generate({
      requestBody: {
        model: this.EMBEDDING_MODEL,
        input,
        encodingFormat: 'float',
        dimensions: this.EMBEDDING_DIMENSIONS,
      },
    } as any);

    const body = typeof response === 'string' ? JSON.parse(response) : response;
    const first = body?.data?.[0]?.embedding;

    if (!Array.isArray(first) || first.length === 0) {
      throw new Error('Embedding API returned an invalid vector payload');
    }

    return first as number[];
  }

  /**
   * Semantic similarity search (cosine) across stored research embeddings.
   * Optionally scoped to one idea for contextual retrieval.
   */
  async findSimilarResearch(
    query: string,
    ideaId?: string,
    limit = this.DEFAULT_LIMIT,
  ): Promise<SimilarResearchResult[]> {
    const safeLimit = Math.max(1, Math.min(limit, this.DEFAULT_LIMIT));
    const queryEmbedding = await this.generateEmbedding(query);
    const vectorLiteral = this.toVectorLiteral(queryEmbedding);

    const whereIdea = ideaId
      ? Prisma.sql`AND idea_id = ${ideaId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        source_url: string | null;
        score: number;
      }>
    >(Prisma.sql`
      SELECT
        id,
        content,
        source_url,
        1 - (embedding <=> ${vectorLiteral}::vector) AS score
      FROM "ResearchData"
      WHERE embedding IS NOT NULL
      ${whereIdea}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${safeLimit}
    `);

    return rows;
  }

  private toVectorLiteral(values: number[]): string {
    if (!values || values.length === 0) {
      throw new Error('Cannot convert empty embedding to vector literal');
    }

    const safe = values.map((v) => {
      if (!Number.isFinite(v)) {
        throw new Error('Embedding contains a non-finite number');
      }
      return Number(v);
    });

    return `[${safe.join(',')}]`;
  }
}
