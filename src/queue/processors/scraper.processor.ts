import { Logger } from '@nestjs/common';
import {
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

type ScrapingJobData = {
  ideaId: string;
  jobId: string;
  title: string;
  keywords: string[];
  sourceType: 'reddit' | 'hackernews' | 'producthunt' | 'google';
};

@Processor('scraping:tasks')
export class ScraperProcessor {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handleScraping(job: Job<ScrapingJobData>) {
    const { ideaId, jobId, title, sourceType, keywords } = job.data;

    this.logger.log(`Scraping ${sourceType} for idea ${ideaId}`);

    if (!ideaId || !sourceType) {
      throw new Error('ideaId and sourceType are required');
    }

    try {
      // Generate mock data based on source type
      const mockData = this.generateMockData(sourceType, title, keywords);

      // Save each data point to database
      const savedRecords = await Promise.all(
        mockData.map((item) =>
          this.prisma.researchData.create({
            data: {
              idea_id: ideaId,
              source_type: sourceType,
              source_name: item.source,
              source_url: item.url,
              data_type: item.dataType,
              title: item.title,
              content: item.content,
              author: item.author,
              score: item.score,
              comments_count: item.comments,
              processed: false,
            },
          }),
        ),
      );

      // Update JobProgress with collected data count
      if (jobId) {
        await this.prisma.jobProgress.update(
          {
            where: { job_id: jobId },
            data: {
              data_points_collected: {
                increment: savedRecords.length,
              },
            },
          },
          // Use try-catch to handle in case JobProgress doesn't exist yet
        ).catch((error) => {
          this.logger.warn(`Could not update JobProgress: ${error.message}`);
        });
      }

      this.logger.log(
        `Scraped ${savedRecords.length} items from ${sourceType}`,
      );

      return {
        ok: true,
        sourceType,
        itemsCollected: savedRecords.length,
        jobId,
      };
    } catch (error) {
      this.logger.error(`Scraping failed for ${sourceType}`, error);
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Scraping job ${job.id} failed`, error.stack);
  }

  private generateMockData(
    sourceType: string,
    title: string,
    keywords: string[],
  ) {
    const sourceConfig = {
      reddit: {
        source: 'Reddit',
        dataType: 'discussion',
        count: 8,
        baseScore: 50,
      },
      hackernews: {
        source: 'Hacker News',
        dataType: 'post',
        count: 5,
        baseScore: 100,
      },
      producthunt: {
        source: 'Product Hunt',
        dataType: 'product',
        count: 6,
        baseScore: 150,
      },
      google: {
        source: 'Google Search',
        dataType: 'article',
        count: 10,
        baseScore: 0,
      },
    };

    const config =
      sourceConfig[sourceType as keyof typeof sourceConfig] ||
      sourceConfig.google;

    return Array.from({ length: config.count }, (_, i) => ({
      title: `${keywords[0] || title} discussion/article ${i + 1}`,
      content: `This is mock content about ${keywords.join(', ')} from ${config.source}. ` +
        `It discusses potential use cases, benefits, and challenges. ` +
        `The original discussion/post is indexed here for reference.`,
      author: `user_${Math.random().toString(36).substr(2, 9)}`,
      source: config.source,
      url: `https://${sourceType}.example.com/post/${i + 1}`,
      dataType: config.dataType,
      score: config.baseScore + Math.floor(Math.random() * 50),
      comments: Math.floor(Math.random() * 100),
    }));
  }
}
