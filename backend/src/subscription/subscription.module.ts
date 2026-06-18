import { Module } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  providers: [SubscriptionPlanService],
  exports: [SubscriptionPlanService],
})
export class SubscriptionModule {}
