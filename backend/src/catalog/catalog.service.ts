import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateAppDto } from './dto/create-app.dto';
import { CreateDurationDto } from './dto/create-duration.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { UpdateDurationDto } from './dto/update-duration.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories(sellerId: string) {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
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

  async updateCategory(sellerId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.sellerId !== sellerId) throw new ForbiddenException('Not your category');

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      },
    });
  }

  async softDeleteCategory(sellerId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.sellerId !== sellerId) throw new ForbiddenException('Not your category');

    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getTemplates(categoryId: string) {
    return this.prisma.appTemplate.findMany({
      where: { categoryId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async getApps(sellerId: string, categoryId?: string) {
    const where: any = { sellerId, deletedAt: null };
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
          where: { active: true, deletedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const appsWithStock = await Promise.all(
      apps.map(async (app) => {
        const stockCount = await this.prisma.subAccount.count({
          where: {
            status: 'AVAILABLE',
            deletedAt: null,
            account: {
              deletedAt: null,
              duration: { appId: app.id, deletedAt: null },
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

  async updateApp(sellerId: string, id: string, dto: UpdateAppDto) {
    const app = await this.prisma.app.findFirst({
      where: { id, deletedAt: null },
    });
    if (!app) throw new NotFoundException('App not found');
    if (app.sellerId !== sellerId) throw new ForbiddenException('Not your app');

    return this.prisma.app.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  async softDeleteApp(sellerId: string, id: string) {
    const app = await this.prisma.app.findFirst({
      where: { id, deletedAt: null },
    });
    if (!app) throw new NotFoundException('App not found');
    if (app.sellerId !== sellerId) throw new ForbiddenException('Not your app');

    return this.prisma.app.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getDurations(appId: string) {
    return this.prisma.duration.findMany({
      where: { appId, active: true, deletedAt: null },
      orderBy: { days: 'asc' },
    });
  }

  async createDuration(sellerId: string, appId: string, dto: CreateDurationDto) {
    const app = await this.prisma.app.findFirst({
      where: { id: appId, sellerId, deletedAt: null },
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

  async updateDuration(sellerId: string, id: string, dto: UpdateDurationDto) {
    const duration = await this.prisma.duration.findFirst({
      where: { id, deletedAt: null },
      include: { app: { select: { sellerId: true } } },
    });
    if (!duration) throw new NotFoundException('Duration not found');
    if (duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your duration');

    return this.prisma.duration.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.days !== undefined ? { days: dto.days } : {}),
        ...(dto.basePrice !== undefined ? { basePrice: dto.basePrice } : {}),
        ...(dto.productType !== undefined ? { productType: dto.productType as any } : {}),
        ...(dto.buyerInfoLabel !== undefined ? { buyerInfoLabel: dto.buyerInfoLabel } : {}),
      },
    });
  }

  async softDeleteDuration(sellerId: string, id: string) {
    const duration = await this.prisma.duration.findFirst({
      where: { id, deletedAt: null },
      include: { app: { select: { sellerId: true } } },
    });
    if (!duration) throw new NotFoundException('Duration not found');
    if (duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your duration');

    return this.prisma.duration.update({
      where: { id },
      data: { deletedAt: new Date() },
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
          where: { active: true, deletedAt: null },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('App not found');
    }

    const durationsWithStock = await Promise.all(
      app.durations.map(async (d) => {
        const stockCount = await this.prisma.subAccount.count({
          where: { status: 'AVAILABLE', deletedAt: null, account: { durationId: d.id, deletedAt: null } },
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
