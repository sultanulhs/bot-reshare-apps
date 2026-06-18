import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const where = from || to ? { createdAt: dateFilter } : {};

    const orders = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const orderStats = {
      total: orders.reduce((s, o) => s + o._count, 0),
      paid: orders.find((o) => o.status === 'PAID')?._count ?? 0,
      fulfilled: orders.find((o) => o.status === 'FULFILLED')?._count ?? 0,
      expired: orders.find((o) => o.status === 'EXPIRED')?._count ?? 0,
    };

    const sellerCredits = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'SELLER_CREDIT', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const operatorMarkup = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'OPERATOR_MARKUP', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const subFees = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'SUBSCRIPTION_FEE', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const revenue = {
      gross: (sellerCredits._sum.amount ?? 0) + (operatorMarkup._sum.amount ?? 0),
      operatorMarkup: operatorMarkup._sum.amount ?? 0,
      sellerCredit: sellerCredits._sum.amount ?? 0,
      subscriptionFees: subFees._sum.amount ?? 0,
    };

    return { orders: orderStats, revenue, topProducts: [] };
  }

  async getOrders(query: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          stockUnit: {
            select: { product: { select: { title: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        productTitle: o.stockUnit?.product?.title ?? 'Unknown',
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
