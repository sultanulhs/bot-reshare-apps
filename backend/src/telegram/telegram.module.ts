import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CatalogModule } from '../catalog/catalog.module';
import { BotConfigModule } from '../botconfig/botconfig.module';

@Module({
  imports: [CatalogModule, BotConfigModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
