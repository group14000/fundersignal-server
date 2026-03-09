import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/express';
import type { ClerkClient } from '@clerk/express';

@Injectable()
export class ClerkService {
  private readonly clerkClient: ClerkClient;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('CLERK_SECRET_KEY');
    const publishableKey = this.configService.get<string>(
      'CLERK_PUBLISHABLE_KEY',
    );

    if (!secretKey) {
      throw new Error('CLERK_SECRET_KEY is not set');
    }

    this.clerkClient = createClerkClient({
      secretKey,
      publishableKey,
    });
  }

  getClient(): ClerkClient {
    return this.clerkClient;
  }
}
