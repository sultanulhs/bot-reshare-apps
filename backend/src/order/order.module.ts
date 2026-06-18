import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { MarkupModule } from '../markup/markup.module';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [MarkupModule, DanaModule, PaymentModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
