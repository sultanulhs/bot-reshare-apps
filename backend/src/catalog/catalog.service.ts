import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async getTemplates(categoryId: string) {
    return this.prisma.appTemplate.findMany({
      where: { categoryId },
      orderBy: { name: 'asc' },
    });
  }

  async getApps(sellerId: string, categoryId?: string) {
    const where: any = { sellerId };
    if (categoryId) where.template = { categoryId };

    const apps = await this.prisma.app.findMany({
      where,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
        durations: {
          where: { active: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const appsWithStock = await Promise.all(
      apps.map(async (app) => {
        const stockCount = await this.prisma.subAccount.count({
          where: {
            status: 'AVAILABLE',
            account: {
              duration: { appId: app.id },
            },
          },
        });
        return {
          id: app.id,
          templateId: app.templateId,
          template: app.template,
          notes: app.notes,
          active: app.active,
          createdAt: app.createdAt,
          _count: { durations: app.durations.length },
          stockCount,
        };
      }),
    );
    return appsWithStock;
  }

  async createApp(sellerId: string, dto: CreateAppDto) {
    let templateId = dto.templateId;

    if (!templateId) {
      if (!dto.name || !dto.categoryId) {
        throw new BadRequestException(
          'Either templateId or both name and categoryId must be provided',
        );
      }

      const template = await this.prisma.appTemplate.upsert({
        where: {
          name_categoryId: { name: dto.name, categoryId: dto.categoryId },
        },
        update: {},
        create: {
          categoryId: dto.categoryId,
          name: dto.name,
          isDefault: false,
          createdBy: sellerId,
        },
      });
      templateId = template.id;
    }

    return this.prisma.app.create({
      data: {
        sellerId,
        templateId,
        notes: dto.notes,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
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
        template: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
        durations: {
          where: { active: true },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('App not found');
    }

    const durationsWithStock = await Promise.all(
      app.durations.map(async (d) => {
        const stockCount = await this.prisma.subAccount.count({
          where: { status: 'AVAILABLE', account: { durationId: d.id } },
        });
        return {
          id: d.id,
          label: d.label,
          days: d.days,
          basePrice: d.basePrice,
          productType: d.productType,
          buyerInfoLabel: d.buyerInfoLabel,
          stockCount,
        };
      }),
    );

    return {
      ...app,
      durations: durationsWithStock,
    };
  }
}
