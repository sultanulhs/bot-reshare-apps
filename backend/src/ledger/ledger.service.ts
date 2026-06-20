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
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { sellerId, type: 'SELLER_CREDIT' },
      include: {
        order: {
          select: {
            fulfilledAt: true,
            duration: {
              select: { label: true, app: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map((e) => ({
      orderId: e.orderId,
      productTitle: e.order?.duration?.app?.name ?? 'Unknown',
      amount: e.amount,
      soldAt: e.order?.fulfilledAt ?? e.createdAt,
    }));
  }
}
