import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import {
  VerifyEmailDto,
  ResendEmailOtpDto,
  StartPhoneVerificationDto,
  VerifyPhoneDto,
  VerifySubscriptionDto,
} from './dto/verify-email.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionPlanService } from '../subscription/subscription-plan.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth/verify')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly subscription: SubscriptionService,
    private readonly planService: SubscriptionPlanService,
    private readonly prisma: PrismaService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const userId = await this.verification.decodeVerifyToken(dto.verifyToken);
    await this.verification.verifyEmailOtp(userId, dto.code);
    return { message: 'Email berhasil diverifikasi' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('email/resend')
  async resendEmailOtp(@Body() dto: ResendEmailOtpDto) {
    const userId = await this.verification.decodeVerifyToken(dto.verifyToken);
    await this.verification.generateEmailOtp(userId);
    return { message: 'Kode OTP baru telah dikirim ke email Anda' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('phone/start')
  async startPhoneVerification(@Body() dto: StartPhoneVerificationDto) {
    const userId = await this.verification.decodeVerifyToken(dto.verifyToken);
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      throw new Error('Seller not found');
    }
    const { deepLink } = await this.verification.startPhoneVerification(seller.id);
    return { deepLink };
  }

  @HttpCode(HttpStatus.OK)
  @Post('phone')
  async verifyPhone(@Body() dto: VerifyPhoneDto) {
    const userId = await this.verification.decodeVerifyToken(dto.verifyToken);
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      throw new Error('Seller not found');
    }
    await this.verification.verifyPhoneOtp(seller.id, dto.code);
    return { message: 'Nomor telepon berhasil diverifikasi' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('subscription')
  async verifySubscription(@Body() dto: VerifySubscriptionDto) {
    const userId = await this.verification.decodeVerifyToken(dto.verifyToken);
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      throw new Error('Seller not found');
    }
    const result = await this.subscription.checkout(seller.id, dto.planId);
    return {
      qrContent: result.qrContent,
      partnerReferenceNo: result.partnerReferenceNo,
    };
  }

  @Get('/plans')
  async getPlans() {
    const plans = await this.planService.getPlans();
    return plans.filter((p) => p.active);
  }
}
