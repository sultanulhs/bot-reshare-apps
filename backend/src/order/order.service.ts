import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
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
  durationId: string;
  sellerId: string;
  buyerInfo?: string;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly markupService: MarkupService,
    private readonly danaService: DanaService,
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
    @InjectQueue('order-expiry') private readonly expiryQueue: Queue,
    private readonly cryptoService: CryptoService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {}

  async createOrder(params: CreateOrderParams) {
    const duration = await this.prisma.duration.findFirst({
      where: { id: params.durationId, active: true, app: { sellerId: params.sellerId, active: true } },
      include: { app: { include: { template: true } } },
    });
    if (!duration) {
      throw new BadRequestException('Duration not available');
    }

    return this.prisma.$transaction(async (tx) => {
      let accountId: string | undefined;
      let subAccountId: string | undefined;

      if (duration.productType === 'AKUN_READY') {
        const account = await tx.account.findFirst({
          where: { durationId: duration.id, status: 'AVAILABLE' },
        });
        if (!account) {
          throw new BadRequestException('No stock available');
        }
        await tx.account.update({
          where: { id: account.id },
          data: { status: 'LOCKED' },
        });
        // Lock all sub-accounts too
        await tx.subAccount.updateMany({
          where: { accountId: account.id },
          data: { status: 'LOCKED' },
        });
        accountId = account.id;
      } else if (duration.productType === 'SUB_AKUN') {
        const subAccount = await tx.subAccount.findFirst({
          where: { status: 'AVAILABLE', account: { durationId: duration.id } },
          include: { account: true },
        });
        if (!subAccount) {
          throw new BadRequestException('No sub-account available');
        }
        await tx.subAccount.update({
          where: { id: subAccount.id },
          data: { status: 'LOCKED' },
        });
        subAccountId = subAccount.id;
        accountId = subAccount.accountId;
      }
      // MANUAL: no account needed

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
    });

    if (!order || order.status !== 'PENDING') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });

      if (order.accountId) {
        await tx.account.update({
          where: { id: order.accountId },
          data: { status: 'AVAILABLE' },
        });
        // Release sub-accounts too
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
    });
  }

  async getSellerPendingFulfillments(sellerId: string) {
    return this.prisma.order.findMany({
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

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date(),
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
}
