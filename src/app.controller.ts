import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ClerkGuard } from './auth/guards/clerk.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import type { AuthObject } from '@clerk/express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
}
