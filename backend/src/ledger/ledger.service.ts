import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(sellerId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { sellerId, type: 'SELLER_CREDIT' },
      orderBy: { createdAt: 'desc' },
    });

    const available = entries.reduce((sum, e) => sum + e.amount, 0);

    return {
      available,
      currency: 'IDR' as const,
      entries: entries.map((e) => ({
        orderId: e.orderId,
        amount: e.amount,
        createdAt: e.createdAt,
      })),
    };
  }

  async getSales(sellerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { duration: { app: { sellerId } } },
      include: {
        duration: {
          include: { app: { include: { template: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(orders.map(async (o) => {
      const [pendingLoginReportCount, totalLoginReportCount] = await Promise.all([
        this.prisma.loginReport.count({ where: { orderId: o.id, status: 'PENDING' } }),
        this.prisma.loginReport.count({ where: { orderId: o.id } }),
      ]);
      return {
        orderId: o.id,
        productTitle: o.duration?.app?.template?.name ?? 'Unknown',
        durationLabel: o.duration?.label ?? null,
        status: o.status,
        totalAmount: o.totalAmount,
        buyerName: o.buyerName ?? null,
        buyerUsername: o.buyerUsername ?? null,
        buyerTgUserId: o.buyerTgUserId.toString(),
        createdAt: o.createdAt,
        expiresAt: o.expiresAt,
        fulfilledAt: o.fulfilledAt,
        accessExpiresAt: o.accessExpiresAt,
        warrantyStatus: o.warrantyStatus,
        loginReportCount: pendingLoginReportCount,
        totalLoginReportCount,
      };
    }));
  }
}
