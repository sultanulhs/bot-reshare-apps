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
      duration: { findFirst: jest.fn() },
      account: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      subAccount: { create: jest.fn(), findMany: jest.fn() },
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

  describe('addAccount', () => {
    it('should encrypt credentials and create account', async () => {
      prisma.duration.findFirst.mockResolvedValue({ id: 'dur-1' });
      prisma.account.create.mockResolvedValue({
        id: 'acc-1',
        status: 'AVAILABLE',
      });

      const result = await service.addAccount('seller-1', 'dur-1', {
        email: 'user@example.com',
        password: 'password123',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('user@example.com');
      expect(crypto.encrypt).toHaveBeenCalledWith('password123');
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          durationId: 'dur-1',
          encEmail: 'encrypted-cred',
          emailIv: 'iv-abc',
          emailTag: 'tag-def',
          encPassword: 'encrypted-cred',
          passwordIv: 'iv-abc',
          passwordTag: 'tag-def',
          status: 'AVAILABLE',
        },
      });
      expect(result).toEqual({ accountId: 'acc-1', status: 'AVAILABLE' });
    });

    it('should throw NotFoundException if duration not found for seller', async () => {
      prisma.duration.findFirst.mockResolvedValue(null);

      await expect(
        service.addAccount('seller-1', 'dur-x', {
          email: 'test@test.com',
          password: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAccounts', () => {
    it('should return accounts WITHOUT credential fields', async () => {
      prisma.duration.findFirst.mockResolvedValue({ id: 'dur-1' });
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          durationId: 'dur-1',
          status: 'AVAILABLE',
          createdAt: new Date('2026-01-01'),
          _count: { subAccounts: 0 },
        },
      ]);

      const result = await service.listAccounts('seller-1', 'dur-1');

      expect(result[0]).toEqual({
        id: 'acc-1',
        durationId: 'dur-1',
        status: 'AVAILABLE',
        createdAt: expect.any(Date),
        _count: { subAccounts: 0 },
      });
      expect(result[0]).not.toHaveProperty('encEmail');
      expect(result[0]).not.toHaveProperty('encPassword');
    });
  });
});
