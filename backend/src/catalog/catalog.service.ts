import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateAppDto } from './dto/create-app.dto';
import { CreateDurationDto } from './dto/create-duration.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories(sellerId: string) {
    return this.prisma.category.findMany({
      where: {
        OR: [{ isDefault: true }, { sellerId }],
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(sellerId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        sellerId,
      },
    });
  }

  async getApps(sellerId: string, categoryId?: string) {
    const where: any = { sellerId };
    if (categoryId) where.categoryId = categoryId;

    return this.prisma.app.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, icon: true } },
        durations: {
          where: { active: true },
          select: { id: true, label: true, days: true, basePrice: true, productType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApp(sellerId: string, dto: CreateAppDto) {
    return this.prisma.app.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async getDurations(appId: string) {
    return this.prisma.duration.findMany({
      where: { appId, active: true },
      orderBy: { days: 'asc' },
    });
  }

  async createDuration(sellerId: string, appId: string, dto: CreateDurationDto) {
    const app = await this.prisma.app.findFirst({
      where: { id: appId, sellerId },
    });
    if (!app) {
      throw new NotFoundException('App not found');
    }

    return this.prisma.duration.create({
      data: {
        appId,
        label: dto.label,
        days: dto.days,
        basePrice: dto.basePrice,
        productType: dto.productType as any,
        buyerInfoLabel: dto.buyerInfoLabel,
      },
    });
  }

  async getAppWithStock(appId: string) {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        durations: {
          where: { active: true },
          include: {
            _count: {
              select: {
                accounts: { where: { status: 'AVAILABLE' } },
              },
            },
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('App not found');
    }

    return {
      ...app,
      durations: app.durations.map((d) => ({
        id: d.id,
        label: d.label,
        days: d.days,
        basePrice: d.basePrice,
        productType: d.productType,
        buyerInfoLabel: d.buyerInfoLabel,
        availableStock: d._count.accounts,
      })),
    };
  }
}
