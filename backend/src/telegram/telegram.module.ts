import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CatalogModule } from '../catalog/catalog.module';
import { BotConfigModule } from '../botconfig/botconfig.module';
import { OrderModule } from '../order/order.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [CatalogModule, BotConfigModule, forwardRef(() => OrderModule), forwardRef(() => VerificationModule)],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
