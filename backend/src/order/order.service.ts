import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
  NotFoundException,
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
    @InjectQueue('warranty-expiry') private readonly warrantyQueue: Queue,
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

    // Seed access expiry scan job (every 10 minutes)
    await this.expiryQueue.add('scan-access-expiry', {}, {
      repeat: { pattern: '*/10 * * * *' },
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

    // Setup warranty if seller has it configured
    await this.setupWarranty(orderId, sellerId, fulfilledAt);
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

  async submitWarrantyPhoto(buyerTgUserId: bigint, orderId: string, fileId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerTgUserId !== buyerTgUserId) {
      throw new BadRequestException('Order not found');
    }
    if (order.warrantyStatus !== 'PENDING') {
      throw new BadRequestException('Warranty is not pending');
    }
    if (order.warrantyDeadline && order.warrantyDeadline < new Date()) {
      throw new BadRequestException('Warranty deadline has passed');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { warrantyStatus: 'SUBMITTED', warrantyPhoto: fileId, warrantyAt: new Date() },
    });
    await this.prisma.warrantyPhoto.create({
      data: { orderId, fileId, status: 'SUBMITTED' },
    });
    return { success: true };
  }

  async verifyWarranty(sellerId: string, orderId: string, approved: boolean, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order does not belong to this seller');
    }
    if (order.warrantyStatus !== 'SUBMITTED') {
      throw new BadRequestException('Warranty is not awaiting verification');
    }

    // Find the latest WarrantyPhoto for this order
    const latestPhoto = await this.prisma.warrantyPhoto.findFirst({
      where: { orderId, status: 'SUBMITTED' },
      orderBy: { createdAt: 'desc' },
    });

    if (approved) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { warrantyStatus: 'ACTIVE' },
      });
      if (latestPhoto) {
        await this.prisma.warrantyPhoto.update({
          where: { id: latestPhoto.id },
          data: { status: 'APPROVED' },
        });
      }
      try {
        await this.telegramService.bot.api.sendMessage(
          order.buyerTgUserId.toString(),
          '\u{2705} Garansi kamu telah diverifikasi dan aktif!',
        );
      } catch {}
    } else {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { warrantyStatus: 'PENDING' },
      });
      if (latestPhoto) {
        await this.prisma.warrantyPhoto.update({
          where: { id: latestPhoto.id },
          data: { status: 'REJECTED', reason: reason || null },
        });
      }
      const rejectMessage = `\u{274C} Foto garansi ditolak.\n\n\u{1F4DD} Alasan: ${reason || 'Tidak sesuai'}\n\nSilakan kirim ulang foto melalui menu \u{1F6E1}\u{FE0F} Garansi.`;
      try {
        await this.telegramService.bot.api.sendMessage(
          order.buyerTgUserId.toString(),
          rejectMessage,
        );
      } catch {}
    }
    return { success: true };
  }

  async expireWarranty(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.warrantyStatus !== 'PENDING') return;
    await this.prisma.order.update({
      where: { id: orderId },
      data: { warrantyStatus: 'EXPIRED' },
    });
    try {
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        '❌ Garansi pesanan kamu telah hangus karena tidak mengirim foto login dalam batas waktu.',
      );
    } catch {}
  }

  async getWarrantyPhotoUrl(sellerId: string, orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order || !order.warrantyPhoto) return null;
    if (order.duration?.app?.sellerId !== sellerId) return null;
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    const fileInfo = await this.telegramService.bot.api.getFile(order.warrantyPhoto);
    return `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  }

  async getWarrantyPhotos(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order || !order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order not found');
    }
    return this.prisma.warrantyPhoto.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getWarrantyPhotoImageUrl(sellerId: string, photoId: string): Promise<string | null> {
    const photo = await this.prisma.warrantyPhoto.findUnique({
      where: { id: photoId },
      include: { order: { include: { duration: { include: { app: true } } } } },
    });
    if (!photo || photo.order.duration?.app?.sellerId !== sellerId) return null;
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    const fileInfo = await this.telegramService.bot.api.getFile(photo.fileId);
    return `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  }

  async submitLoginReport(buyerTgUserId: bigint, orderId: string, fileId: string, caption?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.buyerTgUserId !== buyerTgUserId) throw new BadRequestException('Order not found');
    if (order.warrantyStatus !== 'PENDING') throw new BadRequestException('Warranty is not pending');

    // Find or create pending report for this order
    let report = await this.prisma.loginReport.findFirst({
      where: { orderId, status: 'PENDING' },
    });

    const isNew = !report;
    if (!report) {
      report = await this.prisma.loginReport.create({ data: { orderId } });
    }

    // Add photo to the report
    await this.prisma.loginReportPhoto.create({
      data: { reportId: report.id, fileId, caption: caption || null },
    });

    return { success: true, isNew };
  }

  async getLoginReports(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } } },
    });
    if (!order || !order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order not found');
    }
    return this.prisma.loginReport.findMany({
      where: { orderId },
      include: { photos: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveLoginReport(sellerId: string, reportId: string, note?: string) {
    const report = await this.prisma.loginReport.findUnique({
      where: { id: reportId },
      include: { order: { include: { duration: { include: { app: true } } } } },
    });
    if (!report || report.order.duration?.app?.sellerId !== sellerId) {
      throw new BadRequestException('Report not found');
    }
    await this.prisma.loginReport.update({
      where: { id: reportId },
      data: { status: 'RESOLVED', resolvedNote: note || null, resolvedAt: new Date() },
    });
    // Notify buyer
    try {
      await this.telegramService.bot.api.sendMessage(
        report.order.buyerTgUserId.toString(),
        `\u{2705} Laporan login kamu telah ditangani oleh penjual.${note ? `\n\n\u{1F4DD} Catatan: ${note}` : ''}\n\nSilakan coba login kembali dan aktivasi garansi.`,
      );
    } catch {}
    return { success: true };
  }

  async getLoginReportPhotoUrl(sellerId: string, photoId: string): Promise<string | null> {
    const photo = await this.prisma.loginReportPhoto.findUnique({
      where: { id: photoId },
      include: { report: { include: { order: { include: { duration: { include: { app: true } } } } } } },
    });
    if (!photo || photo.report.order.duration?.app?.sellerId !== sellerId) return null;
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    const fileInfo = await this.telegramService.bot.api.getFile(photo.fileId);
    return `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  }

  async getAvailableReplacements(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: true } }, subAccount: { include: { account: true } }, account: true },
    });
    if (!order || !order.duration || order.duration.app.sellerId !== sellerId) {
      throw new BadRequestException('Order not found');
    }

    if (order.subAccountId) {
      // Sub-account order: find other AVAILABLE sub-accounts in same duration
      const subs = await this.prisma.subAccount.findMany({
        where: {
          status: 'AVAILABLE', deletedAt: null,
          id: { not: order.subAccountId }, // exclude current
          account: { durationId: order.durationId!, deletedAt: null },
        },
        include: { account: true },
      });
      return subs.map(s => ({
        id: s.id,
        type: 'subAccount' as const,
        email: this.cryptoService.decrypt(s.account.encEmail, s.account.emailIv, s.account.emailTag),
        password: this.cryptoService.decrypt(s.account.encPassword, s.account.passwordIv, s.account.passwordTag),
        name: this.cryptoService.decrypt(s.encName, s.nameIv, s.nameTag),
        pin: this.cryptoService.decrypt(s.encPin, s.pinIv, s.pinTag),
      }));
    } else if (order.accountId) {
      // Account-only order: find other AVAILABLE accounts without sub-accounts in same duration
      const accs = await this.prisma.account.findMany({
        where: {
          status: 'AVAILABLE', deletedAt: null,
          durationId: order.durationId!,
          id: { not: order.accountId },
          subAccounts: { none: { deletedAt: null } },
        },
      });
      return accs.map(a => ({
        id: a.id,
        type: 'account' as const,
        email: this.cryptoService.decrypt(a.encEmail, a.emailIv, a.emailTag),
        password: this.cryptoService.decrypt(a.encPassword, a.passwordIv, a.passwordTag),
      }));
    }
    return [];
  }

  async replaceOrderStock(sellerId: string, orderId: string, stockId: string, stockType: 'subAccount' | 'account') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: { include: { template: true } } } } },
    });
    if (!order || order.status !== 'FULFILLED') throw new BadRequestException('Order not found or not fulfilled');
    if (!order.duration || order.duration.app.sellerId !== sellerId) throw new BadRequestException('Not your order');

    // Capture old credential label before replacing
    let oldCredLabel = '';
    if (order.subAccountId) {
      const oldSub = await this.prisma.subAccount.findUnique({ where: { id: order.subAccountId }, include: { account: true } });
      if (oldSub) {
        const oldEmail = this.cryptoService.decrypt(oldSub.account.encEmail, oldSub.account.emailIv, oldSub.account.emailTag);
        const oldName = this.cryptoService.decrypt(oldSub.encName, oldSub.nameIv, oldSub.nameTag);
        oldCredLabel = `${oldEmail} / ${oldName}`;
      }
    } else if (order.accountId) {
      const oldAcc = await this.prisma.account.findUnique({ where: { id: order.accountId } });
      if (oldAcc) {
        oldCredLabel = this.cryptoService.decrypt(oldAcc.encEmail, oldAcc.emailIv, oldAcc.emailTag);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Release old stock as NEEDS_REPAIR (not AVAILABLE)
      if (order.subAccountId) {
        await tx.subAccount.update({ where: { id: order.subAccountId }, data: { status: 'NEEDS_REPAIR' } });
      }
      if (order.accountId) {
        await tx.account.update({ where: { id: order.accountId }, data: { status: 'NEEDS_REPAIR' } });
      }

      // Assign new stock
      if (stockType === 'subAccount') {
        await tx.subAccount.update({ where: { id: stockId }, data: { status: 'SOLD' } });
        await tx.order.update({
          where: { id: orderId },
          data: { subAccountId: stockId, accountId: null, warrantyStatus: 'PENDING', warrantyPhoto: null, warrantyAt: null },
        });
      } else {
        await tx.account.update({ where: { id: stockId }, data: { status: 'SOLD' } });
        await tx.order.update({
          where: { id: orderId },
          data: { accountId: stockId, subAccountId: null, warrantyStatus: 'PENDING', warrantyPhoto: null, warrantyAt: null },
        });
      }

      // Resolve all pending login reports (temporary note)
      await tx.loginReport.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'RESOLVED', resolvedNote: 'Akun diganti oleh penjual', resolvedAt: new Date() },
      });
    });

    // Build new credential label and update resolvedNote with from→to info
    let newCredLabel = '';
    let credentialText = '';
    if (stockType === 'subAccount') {
      const sub = await this.prisma.subAccount.findUnique({ where: { id: stockId }, include: { account: true } });
      if (sub) {
        const email = this.cryptoService.decrypt(sub.account.encEmail, sub.account.emailIv, sub.account.emailTag);
        const password = this.cryptoService.decrypt(sub.account.encPassword, sub.account.passwordIv, sub.account.passwordTag);
        const name = this.cryptoService.decrypt(sub.encName, sub.nameIv, sub.nameTag);
        const pin = this.cryptoService.decrypt(sub.encPin, sub.pinIv, sub.pinTag);
        newCredLabel = `${email} / ${name}`;
        credentialText = `\u{1F4E7} Email: ${email}\n\u{1F511} Password: ${password}\n\u{1F464} Profil: ${name}\n\u{1F510} PIN: ${pin}`;
      }
    } else {
      const acc = await this.prisma.account.findUnique({ where: { id: stockId } });
      if (acc) {
        const email = this.cryptoService.decrypt(acc.encEmail, acc.emailIv, acc.emailTag);
        const password = this.cryptoService.decrypt(acc.encPassword, acc.passwordIv, acc.passwordTag);
        newCredLabel = email;
        credentialText = `\u{1F4E7} Email: ${email}\n\u{1F511} Password: ${password}`;
      }
    }

    // Update resolvedNote with from→to info
    const replaceNote = `Akun diganti: ${oldCredLabel} → ${newCredLabel}`;
    await this.prisma.loginReport.updateMany({
      where: { orderId, status: 'RESOLVED', resolvedNote: 'Akun diganti oleh penjual' },
      data: { resolvedNote: replaceNote },
    });

    // Send new credentials to buyer
    try {
      const appName = order.duration?.app?.template?.name ?? 'Produk';
      const label = order.duration?.label ?? '';
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `\u{1F504} *Akun kamu telah diganti*\n\n\u{1F4E6} ${appName} (${label})\n\n${credentialText}\n\n\u{1F4F8} Silakan login dan aktivasi garansi kembali.`,
        { parse_mode: 'Markdown' },
      );
    } catch {}

    return { success: true };
  }

  async expireAccessStock() {
    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'FULFILLED',
        accessExpiresAt: { lte: now },
        OR: [
          { subAccount: { status: 'SOLD' } },
          { account: { status: 'SOLD' } },
        ],
      },
      select: { id: true, subAccountId: true, accountId: true },
    });

    for (const order of orders) {
      if (order.subAccountId) {
        await this.prisma.subAccount.update({
          where: { id: order.subAccountId },
          data: { status: 'EXPIRED' },
        });
      }
      if (order.accountId) {
        await this.prisma.account.update({
          where: { id: order.accountId },
          data: { status: 'EXPIRED' },
        });
      }
    }

    if (orders.length > 0) {
      this.logger.log(`Expired stock for ${orders.length} orders`);
    }
  }

  async replaceManualOrder(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { duration: { include: { app: { include: { template: true } } } } },
    });
    if (!order || order.status !== 'FULFILLED') throw new BadRequestException('Order not found or not fulfilled');
    if (!order.duration || order.duration.app.sellerId !== sellerId) throw new BadRequestException('Not your order');
    if (order.duration.productType !== 'MANUAL') throw new BadRequestException('Not a manual order');

    await this.prisma.$transaction(async (tx) => {
      // Resolve all pending login reports
      await tx.loginReport.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'RESOLVED', resolvedNote: 'Akun diganti — minta info baru', resolvedAt: new Date() },
      });

      // Reset order to WAITING_SELLER so seller can re-fulfill
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'WAITING_SELLER',
          buyerInfo: null,
          fulfilledAt: null,
          accessExpiresAt: null,
        },
      });
    });

    // Send message to buyer with inline button to send new info
    try {
      const appName = order.duration?.app?.template?.name ?? 'Produk';
      const label = order.duration?.label ?? '';
      const keyboard = {
        inline_keyboard: [[{ text: '\u{1F4DD} Kirim Info Baru', callback_data: `manual_reinfo_${orderId}` }]],
      };
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `\u{1F504} *Akun diganti*\n\n\u{1F4E6} ${appName}${label ? ` (${label})` : ''}\n\nPenjual telah mengganti akun. Silakan kirim info baru kamu.`,
        { parse_mode: 'Markdown', reply_markup: keyboard },
      );
    } catch {}

    return { success: true };
  }

  async updateManualBuyerInfo(orderId: string, buyerInfo: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'WAITING_SELLER') {
      throw new BadRequestException('Order not in WAITING_SELLER status');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { buyerInfo },
    });
    return { success: true };
  }

  async setupWarranty(orderId: string, sellerId: string, fulfilledAt: Date) {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller?.warrantyHours) return;

    const warrantyDeadline = new Date(fulfilledAt.getTime() + seller.warrantyHours * 3600000);
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { warrantyStatus: 'PENDING', warrantyDeadline },
    });

    await this.warrantyQueue.add('expire', { orderId }, { delay: seller.warrantyHours * 3600000 });

    try {
      await this.telegramService.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `📸 *Aktivasi Garansi*\n\nKirim screenshot login dalam ${seller.warrantyHours} jam untuk mengaktifkan garansi.\n\nGunakan menu 🛡️ Garansi di bot.`,
        { parse_mode: 'Markdown' },
      );
    } catch {}
  }
}
