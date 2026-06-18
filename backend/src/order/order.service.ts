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
  productId: string;
  sellerId: string;
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
    const product = await this.prisma.product.findFirst({
      where: { id: params.productId, sellerId: params.sellerId, active: true },
    });
    if (!product) {
      throw new BadRequestException('Product not available');
    }

    const stockUnit = await this.prisma.stockUnit.findFirst({
      where: { productId: product.id, status: 'AVAILABLE' },
    });
    if (!stockUnit) {
      throw new BadRequestException('No stock available');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.stockUnit.update({
        where: { id: stockUnit.id },
        data: { status: 'LOCKED' },
      });

      const markup = await this.markupService.computeMarkup();
      const totalAmount = product.basePrice + markup;
      const partnerReferenceNo = `ORD_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const ttl = this.config.get<number>('ORDER_TTL_MINUTES') ?? 15;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

      const danaResult = await this.danaService.createQrisOrder({
        partnerReferenceNo,
        amount: totalAmount,
        title: product.title,
      });

      const order = await tx.order.create({
        data: {
          buyerTgUserId: params.buyerTgUserId,
          stockUnitId: stockUnit.id,
          productId: product.id,
          basePrice: product.basePrice,
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

      if (order.stockUnitId) {
        await tx.stockUnit.update({
          where: { id: order.stockUnitId },
          data: { status: 'AVAILABLE' },
        });
      }
    });
  }

  async getSellerPendingFulfillments(sellerId: string) {
    return this.prisma.order.findMany({
      where: {
        status: 'WAITING_SELLER',
        product: { sellerId },
      },
      include: {
        product: { select: { title: true } },
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
      include: { product: true },
    });

    if (!order || order.status !== 'WAITING_SELLER') {
      throw new BadRequestException('Order not in WAITING_SELLER status');
    }
    if (order.product.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }

    const encrypted = this.cryptoService.encrypt(credentials);

    await this.prisma.$transaction(async (tx) => {
      const stockUnit = await tx.stockUnit.create({
        data: {
          productId: order.productId,
          encCredentials: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          status: 'SOLD',
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date(),
          stockUnitId: stockUnit.id,
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
        `✅ Kredensial sudah siap!\n\n📦 ${order.product.title}\n🔑 ${credentials}\n\nSimpan dengan aman.`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to send credentials to buyer ${order.buyerTgUserId}: ${err.message}`,
      );
    }
  }
}
