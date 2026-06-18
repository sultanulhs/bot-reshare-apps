import { Module } from '@nestjs/common';
import { BotConfigService } from './botconfig.service';

@Module({
  providers: [BotConfigService],
  exports: [BotConfigService],
})
export class BotConfigModule {}
