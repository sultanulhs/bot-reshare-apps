import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        create: jest.fn(),
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

  describe('getApps', () => {
    it('should return apps with durations for seller', async () => {
      prisma.app.findMany.mockResolvedValue([
        {
          id: 'app-1',
          name: 'Netflix',
          category: { id: 'cat-1', name: 'Streaming', icon: null },
          durations: [
            { id: 'dur-1', label: '1 Bulan', days: 30, basePrice: 50000, productType: 'AKUN_READY' },
          ],
        },
      ]);

      const result = await service.getApps('seller-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
      expect(result[0].durations).toHaveLength(1);
    });

    it('should filter by categoryId', async () => {
      prisma.app.findMany.mockResolvedValue([]);

      await service.getApps('seller-1', 'cat-1');
      expect(prisma.app.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sellerId: 'seller-1', categoryId: 'cat-1' },
        }),
      );
    });
  });

  describe('getAppWithStock', () => {
    it('should return app with duration stock counts', async () => {
      prisma.app.findUnique.mockResolvedValue({
        id: 'app-1',
        name: 'Netflix',
        category: { id: 'cat-1', name: 'Streaming', icon: null },
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
      expect(result.name).toBe('Netflix');
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
