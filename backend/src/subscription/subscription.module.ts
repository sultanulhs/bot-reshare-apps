import { Module } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [DanaModule, PaymentModule],
  providers: [SubscriptionPlanService, SubscriptionService],
  exports: [SubscriptionPlanService, SubscriptionService],
})
export class SubscriptionModule {}
