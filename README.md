<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Local PostgreSQL (Docker) + Prisma Setup

1. Start PostgreSQL (latest image) with Docker:

```bash
$ pnpm run db:up
```

2. Generate Prisma Client:

```bash
$ pnpm run prisma:generate
```

3. Run the first migration:

```bash
$ pnpm run prisma:migrate -- --name init
```

4. (Optional) Open Prisma Studio:

```bash
$ pnpm run prisma:studio
```

Environment values are in `.env`:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `DATABASE_URL`

Default local mapping uses port `5433` to avoid conflicts with an existing local Postgres on `5432`.

## Authentication with Clerk

This project uses [Clerk](https://clerk.com/) for authentication and authorization.

### Setup

Add your Clerk credentials to `.env`:

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Usage

#### Protecting Routes

Use the `ClerkGuard` to protect routes:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkGuard } from './auth/guards/clerk.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';

@Controller('protected')
export class MyController {
  @Get()
  @UseGuards(ClerkGuard)
  protectedRoute(@CurrentUser() auth: AuthObject) {
    return { userId: (auth as any).userId };
  }
}
```

#### Getting Current User

Use the `@CurrentUser()` decorator to access authenticated user data:

```typescript
@Get('me')
@UseGuards(ClerkGuard)
getCurrentUser(@CurrentUser() auth: AuthObject) {
  return {
    userId: (auth as any).userId,
    sessionId: (auth as any).sessionId,
  };
}
```

### Testing Protected Routes

Send requests with a Bearer token in the `Authorization` header:

```bash
curl http://localhost:3000/profile \
  -H "Authorization: Bearer <clerk_jwt_token>"
```

## AI Integration with OpenRouter

This project integrates [OpenRouter](https://openrouter.ai/) for AI-powered features, providing access to 300+ language models through a unified API.

### Setup

Add your OpenRouter API key to `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...

# Optional custom configurations
APP_URL=http://localhost:5000
APP_NAME=FounderSignal
```

### Default Model

The application uses `stepfun/step-3.5-flash:free` as the default model, which is a free, fast model suitable for development and testing.

### Usage

#### Using OpenRouter Service

Inject the `OpenrouterService` into your controllers or services:

```typescript
import { OpenrouterService } from './openrouter/openrouter.service';

@Controller('ai')
export class AiController {
  constructor(private readonly openrouterService: OpenrouterService) {}

  @Post('chat')
  async chat(@Body() body: { prompt: string }) {
    const response = await this.openrouterService.sendPrompt(body.prompt);
    return { response };
  }

  @Post('advanced')
  async advanced(@Body() body: { messages: any[]; model?: string }) {
    const completion = await this.openrouterService.sendChatCompletion(
      body.messages,
      body.model,
    );
    return completion;
  }
}
```

#### Available Methods

- `sendPrompt(prompt: string, model?: string)` - Send a simple text prompt
- `sendChatCompletion(messages, model?, stream?)` - Send chat messages with full control
- `getClient()` - Get the OpenRouter client for advanced usage

### Testing AI Endpoints

Example using the `/ai/chat` endpoint:

```bash
curl -X POST http://localhost:5000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain quantum computing in simple terms"}'
```

With a custom model:

```bash
curl -X POST http://localhost:5000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a haiku about programming",
    "model": "anthropic/claude-3-haiku"
  }'
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
