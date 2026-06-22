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
          orderBy: { label: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const appsWithStock = await Promise.all(
      apps.map(async (app) => {
        const appDurationFilter = { deletedAt: null, duration: { appId: app.id, deletedAt: null } };
        const noSubFilter = { ...appDurationFilter, subAccounts: { none: { deletedAt: null } } };
        let stockAvailable =
          (await this.prisma.subAccount.count({ where: { status: 'AVAILABLE', deletedAt: null, account: appDurationFilter } })) +
          (await this.prisma.account.count({ where: { status: 'AVAILABLE', ...noSubFilter } }));
        let stockLocked =
          (await this.prisma.subAccount.count({ where: { status: 'LOCKED', deletedAt: null, account: appDurationFilter } })) +
          (await this.prisma.account.count({ where: { status: 'LOCKED', ...noSubFilter } }));
        let stockSold =
          (await this.prisma.subAccount.count({ where: { status: 'SOLD', deletedAt: null, account: appDurationFilter } })) +
          (await this.prisma.account.count({ where: { status: 'SOLD', ...noSubFilter } }));
        const accountCount = await this.prisma.account.count({
          where: { deletedAt: null, duration: { appId: app.id, deletedAt: null } },
        });

        // Add MANUAL duration stock
        for (const d of app.durations) {
          if (d.productType === 'MANUAL') {
            if (d.manualStock === null) {
              stockAvailable += 1; // unlimited = at least 1 available
            } else {
              const activeOrders = await this.prisma.order.count({
                where: { durationId: d.id, status: { in: ['PENDING', 'FULFILLED', 'WAITING_SELLER'] } },
              });
              stockAvailable += Math.max(0, d.manualStock - activeOrders);
            }
          }
        }
        const expiredCount = await this.prisma.order.count({
          where: {
            status: 'FULFILLED',
            accessExpiresAt: { lte: new Date() },
            duration: { appId: app.id, deletedAt: null },
            OR: [{ subAccountId: { not: null } }, { accountId: { not: null } }],
          },
        });
        const pendingWarrantyCount = await this.prisma.order.count({
          where: { warrantyStatus: 'SUBMITTED', duration: { appId: app.id, deletedAt: null } },
        });
        const loginReportCount = await this.prisma.loginReport.count({
          where: { status: 'PENDING', order: { duration: { appId: app.id } } },
        });
        const totalLoginReportCount = await this.prisma.loginReport.count({
          where: { order: { duration: { appId: app.id } } },
        });
        const needsRepairCount =
          (await this.prisma.subAccount.count({ where: { status: 'NEEDS_REPAIR', deletedAt: null, account: appDurationFilter } })) +
          (await this.prisma.account.count({ where: { status: 'NEEDS_REPAIR', ...noSubFilter } }));
        return {
          id: app.id,
          templateId: app.templateId,
          template: app.template,
          notes: app.notes,
          active: app.active,
          createdAt: app.createdAt,
          _count: { durations: app.durations.length },
          accountCount,
          stockAvailable,
          stockLocked,
          stockSold,
          expiredCount,
          pendingWarrantyCount,
          loginReportCount,
          totalLoginReportCount,
          needsRepairCount,
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

    let templateId: string | undefined;

    if (dto.templateId) {
      templateId = dto.templateId;
    } else if (dto.name && dto.categoryId) {
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

    return this.prisma.app.update({
      where: { id },
      data: {
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(templateId ? { templateId } : {}),
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
      orderBy: { label: 'asc' },
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
        manualStock: dto.manualStock ?? null,
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
        ...(dto.manualStock !== undefined ? { manualStock: dto.manualStock } : {}),
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
          orderBy: { label: 'asc' },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('App not found');
    }

    const durationsWithStock = await Promise.all(
      app.durations.map(async (d) => {
        let accountCount = 0;
        let stockAvailable = 0;
        let stockLocked = 0;
        let stockSold = 0;

        if (d.productType === 'MANUAL') {
          if (d.manualStock === null) {
            stockAvailable = -1; // unlimited
          } else {
            const pendingOrders = await this.prisma.order.count({
              where: { durationId: d.id, status: 'PENDING' },
            });
            const fulfilledOrders = await this.prisma.order.count({
              where: { durationId: d.id, status: { in: ['FULFILLED', 'WAITING_SELLER'] } },
            });
            stockLocked = pendingOrders;
            stockSold = fulfilledOrders;
            stockAvailable = Math.max(0, d.manualStock - pendingOrders - fulfilledOrders);
          }
        } else {
          accountCount = await this.prisma.account.count({
            where: { durationId: d.id, deletedAt: null },
          });
          const durFilter = { durationId: d.id, deletedAt: null };
          const noSubDurFilter = { ...durFilter, subAccounts: { none: { deletedAt: null } } };
          stockAvailable =
            (await this.prisma.subAccount.count({ where: { status: 'AVAILABLE', deletedAt: null, account: durFilter } })) +
            (await this.prisma.account.count({ where: { status: 'AVAILABLE', ...noSubDurFilter } }));
          stockLocked =
            (await this.prisma.subAccount.count({ where: { status: 'LOCKED', deletedAt: null, account: durFilter } })) +
            (await this.prisma.account.count({ where: { status: 'LOCKED', ...noSubDurFilter } }));
          stockSold =
            (await this.prisma.subAccount.count({ where: { status: 'SOLD', deletedAt: null, account: durFilter } })) +
            (await this.prisma.account.count({ where: { status: 'SOLD', ...noSubDurFilter } }));
        }

        const expiredCount = await this.prisma.order.count({
          where: {
            status: 'FULFILLED',
            accessExpiresAt: { lte: new Date() },
            durationId: d.id,
            OR: [{ subAccountId: { not: null } }, { accountId: { not: null } }],
          },
        });
        const pendingWarrantyCount = await this.prisma.order.count({
          where: { warrantyStatus: 'SUBMITTED', durationId: d.id },
        });
        const loginReportCount = await this.prisma.loginReport.count({
          where: { status: 'PENDING', order: { durationId: d.id } },
        });
        const totalLoginReportCount = await this.prisma.loginReport.count({
          where: { order: { durationId: d.id } },
        });
        const durFilterRepair = { durationId: d.id, deletedAt: null };
        const noSubDurFilterRepair = { ...durFilterRepair, subAccounts: { none: { deletedAt: null } } };
        const needsRepairCount =
          (await this.prisma.subAccount.count({ where: { status: 'NEEDS_REPAIR', deletedAt: null, account: durFilterRepair } })) +
          (await this.prisma.account.count({ where: { status: 'NEEDS_REPAIR', ...noSubDurFilterRepair } }));
        return {
          id: d.id,
          label: d.label,
          days: d.days,
          basePrice: d.basePrice,
          productType: d.productType,
          buyerInfoLabel: d.buyerInfoLabel,
          manualStock: d.manualStock,
          accountCount,
          stockAvailable,
          stockLocked,
          stockSold,
          expiredCount,
          pendingWarrantyCount,
          loginReportCount,
          totalLoginReportCount,
          needsRepairCount,
        };
      }),
    );

    return {
      ...app,
      durations: durationsWithStock,
    };
  }
}
