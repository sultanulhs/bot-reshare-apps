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
      include: {
        duration: { include: { app: true } },
        account: { include: { subAccounts: true } },
        subAccount: true,
      },
    });

    if (!order) {
      this.logger.warn(`Order not found for ref: ${refNo}`);
      return;
    }

    if (order.status !== 'PENDING') {
      this.logger.log(`Order ${order.id} already ${order.status}, skipping`);
      return;
    }

    if (!order.duration) {
      this.logger.error(`Order ${order.id} has no duration linked`);
      return;
    }

    const productType = order.duration.productType;

    if (productType === 'AKUN_READY') {
      await this.fulfilAkunReady(order);
    } else if (productType === 'SUB_AKUN') {
      await this.fulfilSubAkun(order);
    } else {
      // MANUAL
      await this.setWaitingSeller(order);
    }
  }

  private async fulfilAkunReady(order: any) {
    const account = order.account;
    if (!account) {
      this.logger.error(`No account linked for AKUN_READY order ${order.id}`);
      await this.setWaitingSeller(order);
      return;
    }

    const email = this.crypto.decrypt(account.encEmail, account.emailIv, account.emailTag);
    const password = this.crypto.decrypt(account.encPassword, account.passwordIv, account.passwordTag);

    let credentialText = `📧 Email: ${email}\n🔑 Password: ${password}`;

    // Include sub-accounts if any
    if (account.subAccounts && account.subAccounts.length > 0) {
      for (const sub of account.subAccounts) {
        const name = this.crypto.decrypt(sub.encName, sub.nameIv, sub.nameTag);
        const pin = this.crypto.decrypt(sub.encPin, sub.pinIv, sub.pinTag);
        credentialText += `\n\n👤 Profil: ${name}\n🔐 PIN: ${pin}`;
      }
    }

    const sellerId = order.duration.app.sellerId;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FULFILLED', fulfilledAt: new Date() },
      });

      await tx.account.update({
        where: { id: account.id },
        data: { status: 'SOLD' },
      });

      if (account.subAccounts && account.subAccounts.length > 0) {
        await tx.subAccount.updateMany({
          where: { accountId: account.id },
          data: { status: 'SOLD' },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          sellerId,
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
          `📦 ${order.duration.app.name} (${order.duration.label})\n` +
          `${credentialText}\n\n` +
          `Simpan dengan aman. Gunakan /report jika ada masalah.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send credentials to buyer: ${err.message}`);
    }

    this.logger.log(`Order ${order.id} fulfilled (AKUN_READY)`);
  }

  private async fulfilSubAkun(order: any) {
    const account = order.account;
    const subAccount = order.subAccount;

    if (!account || !subAccount) {
      this.logger.error(`Missing account/subAccount for SUB_AKUN order ${order.id}`);
      await this.setWaitingSeller(order);
      return;
    }

    const email = this.crypto.decrypt(account.encEmail, account.emailIv, account.emailTag);
    const password = this.crypto.decrypt(account.encPassword, account.passwordIv, account.passwordTag);
    const name = this.crypto.decrypt(subAccount.encName, subAccount.nameIv, subAccount.nameTag);
    const pin = this.crypto.decrypt(subAccount.encPin, subAccount.pinIv, subAccount.pinTag);

    const sellerId = order.duration.app.sellerId;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FULFILLED', fulfilledAt: new Date() },
      });

      await tx.subAccount.update({
        where: { id: subAccount.id },
        data: { status: 'SOLD' },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId,
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
          `📦 ${order.duration.app.name} (${order.duration.label})\n` +
          `📧 Email: ${email}\n🔑 Password: ${password}\n` +
          `👤 Profil: ${name}\n🔐 PIN: ${pin}\n\n` +
          `Simpan dengan aman. Gunakan /report jika ada masalah.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send credentials to buyer: ${err.message}`);
    }

    this.logger.log(`Order ${order.id} fulfilled (SUB_AKUN)`);
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
