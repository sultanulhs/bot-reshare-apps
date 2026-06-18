import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrderService } from './order.service';
import { OrderExpiryProcessor } from './order-expiry.processor';
import { MarkupModule } from '../markup/markup.module';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'order-expiry' }),
    MarkupModule,
    DanaModule,
    PaymentModule,
  ],
  providers: [OrderService, OrderExpiryProcessor],
  exports: [OrderService],
})
export class OrderModule {}
