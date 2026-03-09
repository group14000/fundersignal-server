import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { clerkMiddleware } from '@clerk/express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply Clerk middleware globally
  app.use(clerkMiddleware());

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
