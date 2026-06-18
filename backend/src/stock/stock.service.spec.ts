import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { NotFoundException } from '@nestjs/common';

describe('StockService', () => {
  let service: StockService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      stockUnit: { create: jest.fn(), findMany: jest.fn() },
    };

    crypto = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'encrypted-cred',
        iv: 'iv-abc',
        authTag: 'tag-def',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  describe('addStock', () => {
    it('should encrypt credentials and create stock unit', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', sellerId: 'seller-1' });
      prisma.stockUnit.create.mockResolvedValue({
        id: 'stock-1',
        status: 'AVAILABLE',
      });

      const result = await service.addStock('seller-1', 'prod-1', {
        credentials: 'user@example.com:password123',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('user@example.com:password123');
      expect(prisma.stockUnit.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          encCredentials: 'encrypted-cred',
          iv: 'iv-abc',
          authTag: 'tag-def',
          status: 'AVAILABLE',
        },
      });
      expect(result).toEqual({ stockUnitId: 'stock-1', status: 'AVAILABLE' });
    });

    it('should throw NotFoundException if product not owned by seller', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.addStock('seller-1', 'prod-x', { credentials: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listStock', () => {
    it('should return stock units WITHOUT credential fields', async () => {
      prisma.stockUnit.findMany.mockResolvedValue([
        {
          id: 'stock-1',
          productId: 'prod-1',
          status: 'AVAILABLE',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listStock('seller-1', {});

      expect(result[0]).toEqual({
        id: 'stock-1',
        productId: 'prod-1',
        status: 'AVAILABLE',
        createdAt: expect.any(Date),
      });
      expect(result[0]).not.toHaveProperty('encCredentials');
      expect(result[0]).not.toHaveProperty('iv');
      expect(result[0]).not.toHaveProperty('authTag');
    });
  });
});
