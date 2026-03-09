import { Module } from '@nestjs/common';
import { OpenrouterService } from './openrouter.service';

@Module({
  providers: [OpenrouterService],
  exports: [OpenrouterService],
})
export class OpenrouterModule {}
