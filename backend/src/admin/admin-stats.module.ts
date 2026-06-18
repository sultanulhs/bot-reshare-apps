import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';

@Module({
  providers: [AdminStatsService],
  exports: [AdminStatsService],
})
export class AdminStatsModule {}
