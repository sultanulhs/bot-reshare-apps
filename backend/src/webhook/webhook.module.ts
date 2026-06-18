import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { FulfilmentService } from './fulfilment.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [WebhookController],
  providers: [FulfilmentService],
  exports: [FulfilmentService],
})
export class WebhookModule {}
