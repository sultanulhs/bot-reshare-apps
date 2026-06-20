import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      appTemplate: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      app: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      duration: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('getCategories', () => {
    it('should return categories for seller', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Streaming', icon: null, isDefault: true },
      ]);

      const result = await service.getCategories('seller-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Streaming');
    });
  });

  describe('getTemplates', () => {
    it('should return templates for a category', async () => {
      prisma.appTemplate.findMany.mockResolvedValue([
        { id: 'tpl-1', name: 'Netflix', categoryId: 'cat-1', isDefault: true },
      ]);

      const result = await service.getTemplates('cat-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
    });
  });

  describe('getApps', () => {
    it('should return apps with template for seller', async () => {
      prisma.app.findMany.mockResolvedValue([
        {
          id: 'app-1',
          template: {
            id: 'tpl-1',
            name: 'Netflix',
            category: { id: 'cat-1', name: 'Streaming', icon: null },
          },
          durations: [
            { id: 'dur-1', label: '1 Bulan', days: 30, basePrice: 50000, productType: 'AKUN_READY' },
          ],
        },
      ]);

      const result = await service.getApps('seller-1');
      expect(result).toHaveLength(1);
      expect(result[0].template.name).toBe('Netflix');
      expect(result[0].durations).toHaveLength(1);
    });

    it('should filter by categoryId via template', async () => {
      prisma.app.findMany.mockResolvedValue([]);

      await service.getApps('seller-1', 'cat-1');
      expect(prisma.app.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sellerId: 'seller-1', template: { categoryId: 'cat-1' } },
        }),
      );
    });
  });

  describe('createApp', () => {
    it('should create app with existing templateId', async () => {
      prisma.app.create.mockResolvedValue({
        id: 'app-1',
        templateId: 'tpl-1',
        template: { id: 'tpl-1', name: 'Netflix', category: { id: 'cat-1', name: 'Streaming', icon: null } },
      });

      const result = await service.createApp('seller-1', { templateId: 'tpl-1' });
      expect(result.templateId).toBe('tpl-1');
    });

    it('should upsert template when name+categoryId provided', async () => {
      prisma.appTemplate.upsert.mockResolvedValue({ id: 'tpl-new', name: 'Custom App', categoryId: 'cat-1' });
      prisma.app.create.mockResolvedValue({
        id: 'app-1',
        templateId: 'tpl-new',
        template: { id: 'tpl-new', name: 'Custom App', category: { id: 'cat-1', name: 'Streaming', icon: null } },
      });

      const result = await service.createApp('seller-1', { name: 'Custom App', categoryId: 'cat-1' });
      expect(prisma.appTemplate.upsert).toHaveBeenCalled();
      expect(result.templateId).toBe('tpl-new');
    });

    it('should throw if neither templateId nor name+categoryId provided', async () => {
      await expect(service.createApp('seller-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAppWithStock', () => {
    it('should return app with template and duration stock counts', async () => {
      prisma.app.findUnique.mockResolvedValue({
        id: 'app-1',
        template: {
          id: 'tpl-1',
          name: 'Netflix',
          category: { id: 'cat-1', name: 'Streaming', icon: null },
        },
        durations: [
          {
            id: 'dur-1',
            label: '1 Bulan',
            days: 30,
            basePrice: 50000,
            productType: 'AKUN_READY',
            buyerInfoLabel: null,
            _count: { accounts: 3 },
          },
        ],
      });

      const result = await service.getAppWithStock('app-1');
      expect(result.template.name).toBe('Netflix');
      expect(result.durations[0].availableStock).toBe(3);
    });

    it('should throw NotFoundException if app not found', async () => {
      prisma.app.findUnique.mockResolvedValue(null);

      await expect(service.getAppWithStock('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
