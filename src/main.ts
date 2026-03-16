import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { clerkMiddleware } from '@clerk/express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3000/'],
  });

  app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

  // Apply Clerk middleware globally
  app.use(clerkMiddleware());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
