import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dana: DanaService,
    private readonly payment: PaymentService,
  ) {}

  async checkout(sellerId: string, planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.active) {
      throw new NotFoundException('Subscription plan not found');
    }

    const partnerReferenceNo = `SUB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const danaResult = await this.dana.createQrisOrder({
      partnerReferenceNo,
      amount: plan.price,
      title: `Langganan ${plan.name}`,
    });

    await this.prisma.subscription.create({
      data: {
        sellerId,
        planId,
        partnerReferenceNo,
        status: 'PENDING',
      },
    });

    const qrImage = await this.payment.generateQrImage(danaResult.qrContent);

    return {
      qrContent: danaResult.qrContent,
      qrImage,
      partnerReferenceNo,
    };
  }

  async activateSubscription(partnerReferenceNo: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { partnerReferenceNo },
    });

    if (!sub || sub.status !== 'PENDING') {
      this.logger.log(`Subscription ${partnerReferenceNo} not PENDING, skipping`);
      return;
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: sub.planId },
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (plan?.periodDays ?? 30) * 86400000);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          startedAt: now,
          expiresAt,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId: sub.sellerId,
          orderId: sub.id,
          type: 'SUBSCRIPTION_FEE',
          amount: plan?.price ?? 0,
        },
      });
    });

    this.logger.log(`Subscription ${sub.id} activated until ${expiresAt.toISOString()}`);
  }

  async getSellerSubscription(sellerId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        sellerId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { expiresAt: 'desc' },
    });
  }
}
