import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Processor('manual-reminder')
export class ManualReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ManualReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {
    super();
  }

  async process(job: Job) {
    this.logger.log('Running monthly manual reminder check');

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'FULFILLED',
        reminderEnabled: true,
        duration: { productType: 'MANUAL' },
      },
      include: {
        duration: {
          include: {
            app: {
              include: {
                template: true,
                seller: true,
              },
            },
          },
        },
      },
    });

    for (const order of orders) {
      const seller = order.duration?.app?.seller;
      if (!seller?.tgUserId) continue;

      const appName = order.duration?.app?.template?.name ?? 'Produk';
      const durationLabel = order.duration?.label ?? '';
      const buyerName = order.buyerName ?? `@${order.buyerTgUserId}`;

      try {
        await this.telegramService.bot.api.sendMessage(
          seller.tgUserId.toString(),
          `🔔 Reminder Bulanan\n\n` +
          `Pesanan manual *${appName}* (${durationLabel}) dari *${buyerName}* perlu diupdate.\n` +
          `Cek akun pembeli dan update jika ada perubahan.`,
          { parse_mode: 'Markdown' },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to send reminder to seller ${seller.id}: ${err.message}`);
      }
    }

    this.logger.log(`Sent ${orders.length} manual reminders`);
  }
}
