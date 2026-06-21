import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrderService } from './order.service';
import { OrderExpiryProcessor } from './order-expiry.processor';
import { ManualReminderProcessor } from './manual-reminder.processor';
import { WarrantyExpiryProcessor } from './warranty-expiry.processor';
import { MarkupModule } from '../markup/markup.module';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'order-expiry' }),
    BullModule.registerQueue({ name: 'manual-reminder' }),
    BullModule.registerQueue({ name: 'warranty-expiry' }),
    MarkupModule,
    DanaModule,
    PaymentModule,
    forwardRef(() => TelegramModule),
  ],
  providers: [OrderService, OrderExpiryProcessor, ManualReminderProcessor, WarrantyExpiryProcessor],
  exports: [OrderService],
})
export class OrderModule {}
