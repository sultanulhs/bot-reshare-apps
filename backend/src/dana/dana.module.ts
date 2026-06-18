import { Module } from '@nestjs/common';
import { DanaService } from './dana.service';

@Module({
  providers: [DanaService],
  exports: [DanaService],
})
export class DanaModule {}
