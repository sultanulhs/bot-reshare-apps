import { Module } from '@nestjs/common';
import { MarkupService } from './markup.service';

@Module({
  providers: [MarkupService],
  exports: [MarkupService],
})
export class MarkupModule {}
