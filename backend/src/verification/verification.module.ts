import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [JwtModule.register({}), SubscriptionModule],
  providers: [VerificationService],
  controllers: [VerificationController],
  exports: [VerificationService],
})
export class VerificationModule {}
