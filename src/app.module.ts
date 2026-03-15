import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OpenrouterModule } from './openrouter/openrouter.module';
import { QueueModule } from './queue/queue.module';
import { ResearchModule } from './research/research.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 60 requests per minute per IP across all routes.
    // TTL is in milliseconds for @nestjs/throttler v6+.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    OpenrouterModule,
    QueueModule,
    ResearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register ThrottlerGuard globally via DI so it can receive its
    // injected dependencies (ThrottlerStorage, Reflector).
    // Using APP_GUARD is the correct alternative to app.useGlobalGuards(new ThrottlerGuard())
    // which would bypass the NestJS DI container.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
