import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookController } from './webhook.controller';
import { FulfilmentService } from './fulfilment.service';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'warranty-expiry' }), forwardRef(() => TelegramModule), SubscriptionModule],
  controllers: [WebhookController],
  providers: [FulfilmentService],
  exports: [FulfilmentService],
})
export class WebhookModule {}
