import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { FulfilmentService } from './fulfilment.service';

@Module({
  controllers: [WebhookController],
  providers: [FulfilmentService],
  exports: [FulfilmentService],
})
export class WebhookModule {}
