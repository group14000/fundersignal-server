import { Controller, Get, UseGuards, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { ClerkGuard } from './auth/guards/clerk.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import { OpenrouterService } from './openrouter/openrouter.service';
import type { AuthObject } from '@clerk/express';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly openrouterService: OpenrouterService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
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
