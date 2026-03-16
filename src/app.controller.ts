import {
  Controller,
  Get,
  UseGuards,
  Post,
  Body,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { ClerkGuard } from './auth/guards/clerk.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import { OpenrouterService } from './openrouter/openrouter.service';
import type { AuthObject } from '@clerk/express';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly openrouterService: OpenrouterService,
    @InjectQueue('research:main') private readonly researchQueue: Queue,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const checks: Record<string, 'up' | 'down'> = {};

    // Postgres check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    // Redis check (via Bull queue)
    try {
      await this.researchQueue.getJobCounts();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    const allUp = Object.values(checks).every((s) => s === 'up');

    if (!allUp) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile')
  @UseGuards(ClerkGuard)
  getProfile(@CurrentUser() auth: AuthObject) {
    return {
      message: 'This is a protected route',
      auth: {
        userId: (auth as any).userId,
        sessionId: (auth as any).sessionId,
        sessionClaims: (auth as any).sessionClaims,
      },
    };
  }

  @Post('ai/chat')
  async chat(@Body() body: { prompt: string; model?: string }) {
    const response = await this.openrouterService.sendPrompt(
      body.prompt,
      body.model,
    );
    return {
      response,
      model: body.model || 'stepfun/step-3.5-flash:free',
    };
  }
}
