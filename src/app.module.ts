import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OpenrouterModule } from './openrouter/openrouter.module';
import { QueueModule } from './queue/queue.module';
import { ResearchModule } from './research/research.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, OpenrouterModule, QueueModule, ResearchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
