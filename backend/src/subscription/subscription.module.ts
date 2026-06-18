import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionExpiryProcessor } from './subscription-expiry.processor';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'subscription-expiry' }),
    DanaModule,
    PaymentModule,
  ],
  providers: [SubscriptionPlanService, SubscriptionService, SubscriptionExpiryProcessor],
  exports: [SubscriptionPlanService, SubscriptionService],
})
export class SubscriptionModule {}
