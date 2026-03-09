import { Module } from '@nestjs/common';
import { ClerkService } from './clerk.service';
import { ClerkGuard } from './guards/clerk.guard';

@Module({
  providers: [ClerkService, ClerkGuard],
  exports: [ClerkService, ClerkGuard],
})
export class AuthModule {}
