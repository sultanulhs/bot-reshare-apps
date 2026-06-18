import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockUnit: {
        count: jest.fn(),
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

  describe('listProducts', () => {
    it('should return products with stock counts', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          category: 'streaming',
          title: 'Netflix',
          basePrice: 50000,
          active: true,
          stockType: 'PRE_STOCKED',
          _count: undefined,
          stockUnits: [
            { status: 'AVAILABLE' },
            { status: 'AVAILABLE' },
            { status: 'SOLD' },
          ],
        },
      ]);

      const result = await service.listProducts('seller-1');
      expect(result[0].stockCount).toEqual({
        available: 2,
        locked: 0,
        sold: 1,
      });
    });
  });

  describe('createProduct', () => {
    it('should create a product', async () => {
      prisma.product.create.mockResolvedValue({
        id: 'prod-1',
        category: 'streaming',
        title: 'Netflix',
        basePrice: 50000,
        active: true,
      });

      const result = await service.createProduct('seller-1', {
        category: 'streaming',
        title: 'Netflix',
        basePrice: 50000,
      });

      expect(result.id).toBe('prod-1');
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-1',
          category: 'streaming',
          title: 'Netflix',
          basePrice: 50000,
        },
      });
    });
  });

  describe('updateProduct', () => {
    it('should update product belonging to seller', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', sellerId: 'seller-1' });
      prisma.product.update.mockResolvedValue({
        id: 'prod-1',
        title: 'Netflix Premium',
        basePrice: 60000,
        active: true,
      });

      const result = await service.updateProduct('seller-1', 'prod-1', {
        title: 'Netflix Premium',
        basePrice: 60000,
      });

      expect(result.title).toBe('Netflix Premium');
    });

    it('should throw NotFoundException if product not found or not owned', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProduct('seller-1', 'prod-x', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
