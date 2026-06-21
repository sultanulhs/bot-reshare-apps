import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MarkupService } from '../markup/markup.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';

interface CreateOrderParams {
  buyerTgUserId: bigint;
  buyerName?: string;
  buyerUsername?: string;
  durationId: string;
  sellerId: string;
  buyerInfo?: string;
}

@Injectable()
export class OrderService implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly markupService: MarkupService,
    private readonly danaService: DanaService,
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
    @InjectQueue('order-expiry') private readonly expiryQueue: Queue,
    @InjectQueue('manual-reminder') private readonly reminderQueue: Queue,
    private readonly cryptoService: CryptoService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {}

  async onModuleInit() {
    // Seed monthly reminder cron job
    await this.reminderQueue.add('monthly-reminder', {}, {
      repeat: { pattern: '0 9 1 * *' },
      removeOnComplete: true,
    });
  }

  async createOrder(params: CreateOrderParams) {
    const duration = await this.prisma.duration.findFirst({
      where: { id: params.durationId, active: true, app: { sellerId: params.sellerId, active: true } },
      include: { app: { include: { template: true } } },
    });
    if (!duration) {
      throw new BadRequestException('Duration not available');
    }

    return this.prisma.$transaction(async (tx) => {
      // Block if buyer has a pending order
      const pendingOrder = await tx.order.findFirst({
        where: { buyerTgUserId: params.buyerTgUserId, status: 'PENDING' },
      });
      if (pendingOrder) {
        throw new BadRequestException('Anda masih memiliki pesanan yang belum dibayar. Selesaikan pembayaran terlebih dahulu.');
      }

      let accountId: string | undefined;
      let subAccountId: string | undefined;

      if (duration.productType === 'AKUN_READY') {
        // Try sub-account first (sharing model)
        const sub = await tx.subAccount.findFirst({
          where: {
            status: 'AVAILABLE',
            deletedAt: null,
            account: { durationId: duration.id, deletedAt: null },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (sub) {
          await tx.subAccount.update({ where: { id: sub.id }, data: { status: 'LOCKED' } });
          subAccountId = sub.id;
        } else {
          // Fallback: account without sub-accounts (private model)
          const acc = await tx.account.findFirst({
            where: {
              durationId: duration.id,
              status: 'AVAILABLE',
              deletedAt: null,
              subAccounts: { none: { deletedAt: null } },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (!acc) {
            throw new BadRequestException('No stock available');
          }
          await tx.account.update({ where: { id: acc.id }, data: { status: 'LOCKED' } });
          accountId = acc.id;
        }
      }

      // MANUAL: check stock if manualStock is set
      if (duration.productType === 'MANUAL' && duration.manualStock !== null) {
        const activeOrders = await tx.order.count({
          where: { durationId: duration.id, status: { in: ['PENDING', 'FULFILLED', 'WAITING_SELLER'] } },
        });
        if (activeOrders >= duration.manualStock) {
          throw new BadRequestException('No stock available');
        }
      }

      const markup = await this.markupService.computeMarkup();
      const totalAmount = duration.basePrice + markup;
      const partnerReferenceNo = `ORD_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const ttl = this.config.get<number>('ORDER_TTL_MINUTES') ?? 15;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

      const danaResult = await this.danaService.createQrisOrder({
        partnerReferenceNo,
        amount: totalAmount,
        title: duration.app.template.name,
      });

      const order = await tx.order.create({
        data: {
          buyerTgUserId: params.buyerTgUserId,
          buyerName: params.buyerName ?? null,
          buyerUsername: params.buyerUsername ?? null,
          durationId: duration.id,
          accountId: accountId ?? null,
          subAccountId: subAccountId ?? null,
          buyerInfo: params.buyerInfo ?? null,
          basePrice: duration.basePrice,
          markup,
          totalAmount,
          partnerReferenceNo,
          danaReferenceNo: danaResult.danaReferenceNo,
          qrContent: danaResult.qrContent,
          expiresAt,
        },
      });

      const qrImage = await this.paymentService.generateQrImage(
        danaResult.qrContent,
      );

      await this.expiryQueue.add(
        'expire',
        { orderId: order.id },
        { delay: ttl * 60 * 1000 },
      );

      return {
        orderId: order.id,
        totalAmount: order.totalAmount,
        qrContent: order.qrContent,
        qrImage,
        expiresAt: order.expiresAt,
        partnerReferenceNo,
      };
    });
  }

  async expireOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: { include: { template: true } } } } },
    });

    if (!order || order.status !== 'PENDING') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Release stock first, then null-out FKs so sub-account can be reused
      if (order.accountId) {
        await tx.account.update({
          where: { id: order.accountId },
          data: { status: 'AVAILABLE' },
        });
        await tx.subAccount.updateMany({
          where: { accountId: order.accountId },
          data: { status: 'AVAILABLE' },
        });
      }

      if (order.subAccountId) {
        await tx.subAccount.update({
          where: { id: order.subAccountId },
          data: { status: 'AVAILABLE' },
        });
      }

      // Null-out FKs so the unique constraint is freed for reuse
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED', subAccountId: null, accountId: null },
      });
    });

    try {
      const appName = order.duration?.app?.template?.name ?? 'Produk';
      const durationLabel = order.duration?.label ?? '';
      const price = `Rp${order.totalAmount.toLocaleString('id-ID')}`;
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `❌ Pesanan kamu telah kedaluwarsa karena belum dibayar.\n\n` +
        `📦 ${appName}${durationLabel ? ` (${durationLabel})` : ''}\n` +
        `💰 ${price}\n\n` +
        `Silakan buat pesanan baru jika masih berminat.`,
      );
    } catch {
      // Silently ignore notification failures
    }
  }

  async getExpiredAccounts(sellerId: string) {
    const now = new Date();
    return this.prisma.order.findMany({
      where: {
        status: 'FULFILLED',
        accessExpiresAt: { lte: now },
        duration: { app: { sellerId, deletedAt: null } },
      },
      include: {
        duration: { include: { app: { include: { template: true } } } },
        account: true,
        subAccount: { include: { account: true } },
      },
      orderBy: { accessExpiresAt: 'asc' },
    });
  }

  async getSellerPendingFulfillments(sellerId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'WAITING_SELLER',
        duration: { app: { sellerId } },
      },
      include: {
        duration: {
          include: { app: { include: { template: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      id: o.id,
      appName: o.duration?.app?.template?.name ?? 'Pesanan',
      durationLabel: o.duration?.label ?? '-',
      productType: o.duration?.productType ?? null,
      buyerInfo: o.buyerInfo,
      buyerName: o.buyerName,
      buyerUsername: o.buyerUsername,
      buyerTgUserId: o.buyerTgUserId.toString(),
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
    }));
  }

  async fulfilOnDemand(
    sellerId: string,
    orderId: string,
    credentials: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: { include: { template: true } } } } },
    });

    if (!order || order.status !== 'WAITING_SELLER') {
      throw new BadRequestException('Order not in WAITING_SELLER status');
    }
    if (!order.duration) {
      throw new BadRequestException('Order has no duration linked');
    }
    if (order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }

    const fulfilledAt = new Date();
    const days = order.duration?.days ?? 0;
    const accessExpiresAt = days > 0 ? new Date(fulfilledAt.getTime() + days * 86400000) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfilledAt,
          accessExpiresAt,
          sellerNote: credentials,
        },
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

      await tx.orderMessage.create({ data: { orderId, message: credentials } });
    });

    try {
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `✅ Kredensial sudah siap!\n\n📦 ${order.duration!.app.template.name} (${order.duration!.label})\n🔑 ${credentials}\n\nSimpan dengan aman.`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to send credentials to buyer ${order.buyerTgUserId}: ${err.message}`,
      );
    }
  }

  async sendMessageToBuyer(sellerId: string, orderId: string, message: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }
    if (!['FULFILLED', 'WAITING_SELLER'].includes(order.status)) {
      throw new BadRequestException('Can only message active orders');
    }
    await this.telegramService.bot.api.sendMessage(
      order.buyerTgUserId.toString(),
      `📢 Pesan dari penjual:\n\n${message}`,
    );
    await this.prisma.orderMessage.create({ data: { orderId, message } });
    return { success: true };
  }

  async toggleReminder(sellerId: string, orderId: string, enabled: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { reminderEnabled: enabled },
    });
    return { success: true, reminderEnabled: enabled };
  }

  async getOrderMessages(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }
    return this.prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
