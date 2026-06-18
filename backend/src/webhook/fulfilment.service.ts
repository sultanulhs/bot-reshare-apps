import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly telegram: TelegramService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async handlePaymentNotification(body: {
    originalPartnerReferenceNo: string;
    [key: string]: any;
  }) {
    const refNo = body.originalPartnerReferenceNo;

    if (refNo.startsWith('SUB_')) {
      await this.subscriptionService.activateSubscription(refNo);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { partnerReferenceNo: refNo },
    });

    if (!order) {
      this.logger.warn(`Order not found for ref: ${refNo}`);
      return;
    }

    if (order.status !== 'PENDING') {
      this.logger.log(`Order ${order.id} already ${order.status}, skipping`);
      return;
    }

    if (order.stockUnitId) {
      const stockUnit = await this.prisma.stockUnit.findUnique({
        where: { id: order.stockUnitId },
        include: { product: { select: { title: true, stockType: true, sellerId: true } } },
      });

      if (stockUnit && stockUnit.product.stockType === 'PRE_STOCKED') {
        await this.fulfilPreStocked(order, stockUnit);
        return;
      }
    }

    await this.setWaitingSeller(order);
  }

  private async fulfilPreStocked(order: any, stockUnit: any) {
    const credentials = this.crypto.decrypt(
      stockUnit.encCredentials,
      stockUnit.iv,
      stockUnit.authTag,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FULFILLED', fulfilledAt: new Date() },
      });

      await tx.stockUnit.update({
        where: { id: stockUnit.id },
        data: { status: 'SOLD' },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId: stockUnit.product?.sellerId ?? null,
          orderId: order.id,
          type: 'SELLER_CREDIT',
          amount: order.basePrice,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          orderId: order.id,
          type: 'OPERATOR_MARKUP',
          amount: order.markup,
        },
      });
    });

    try {
      await this.telegram.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `✅ Pembayaran berhasil!\n\n` +
          `📦 Produk: ${stockUnit.product.title}\n` +
          `🔑 Kredensial:\n${credentials}\n\n` +
          `Simpan dengan aman. Gunakan /report jika ada masalah.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send credentials to buyer: ${err.message}`);
    }

    this.logger.log(`Order ${order.id} fulfilled (PRE_STOCKED)`);
  }

  private async setWaitingSeller(order: any) {
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'WAITING_SELLER' },
    });

    try {
      await this.telegram.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `💰 Pembayaran berhasil!\n\n` +
          `⏳ Pesanan sedang disiapkan oleh penjual. Anda akan menerima kredensial segera.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to notify buyer: ${err.message}`);
    }

    this.logger.log(`Order ${order.id} set to WAITING_SELLER`);
  }
}
