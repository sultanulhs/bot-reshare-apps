import { Test, TestingModule } from '@nestjs/testing';
import { AdminSellerService } from './admin-seller.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AdminSellerService', () => {
  let service: AdminSellerService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      seller: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      decrypt: jest.fn().mockReturnValue('BCA 1234567890'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSellerService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<AdminSellerService>(AdminSellerService);
  });

  describe('listSellers', () => {
    it('should return sellers with product count', async () => {
      prisma.seller.findMany.mockResolvedValue([
        {
          id: 's1',
          ownerName: 'Seller1',
          storeName: 'Toko Seller1',
          phone: '081',
          status: 'PENDING',
          createdAt: new Date(),
          user: { email: 'test@test.com' },
          _count: { products: 3 },
        },
      ]);

      const result = await service.listSellers();
      expect(result[0].ownerName).toBe('Seller1');
      expect(result[0].productCount).toBe(3);
    });
  });

  describe('approveSeller', () => {
    it('should transition PENDING to APPROVED and generate storeCode', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'PENDING' });
      prisma.seller.update.mockResolvedValue({
        id: 's1',
        status: 'APPROVED',
        storeCode: 'store_abc123',
      });

      const result = await service.approveSeller('s1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.seller.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({
            status: 'APPROVED',
            storeCode: expect.stringMatching(/^store_/),
          }),
        }),
      );
    });

    it('should throw if seller not PENDING', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
      await expect(service.approveSeller('s1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyProfile', () => {
    it('should transition PROFILE_SUBMITTED to ACTIVE', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'PROFILE_SUBMITTED' });
      prisma.seller.update.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

      const result = await service.verifyProfile('s1');
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw if not PROFILE_SUBMITTED', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'APPROVED' });
      await expect(service.verifyProfile('s1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('suspendSeller', () => {
    it('should suspend any seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
      prisma.seller.update.mockResolvedValue({ id: 's1', status: 'SUSPENDED' });

      const result = await service.suspendSeller('s1', 'violation');
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('getSellerDetail', () => {
    it('should return decrypted payout for PROFILE_SUBMITTED seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        ownerName: 'Seller',
        storeName: 'Toko Seller',
        phone: '081',
        status: 'PROFILE_SUBMITTED',
        user: { email: 'test@test.com' },
        profile: {
          encPayout: 'enc',
          payoutIv: 'iv',
          payoutTag: 'tag',
        },
      });

      const result = await service.getSellerDetail('s1') as any;
      expect(result.profile?.payoutAccount).toBe('BCA 1234567890');
      expect(crypto.decrypt).toHaveBeenCalledWith('enc', 'iv', 'tag');
    });

    it('should not include profile for PENDING seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        ownerName: 'Seller',
        storeName: 'Toko Seller',
        phone: '081',
        status: 'PENDING',
        user: { email: 'test@test.com' },
        profile: null,
      });

      const result = await service.getSellerDetail('s1') as any;
      expect(result.profile).toBeUndefined();
    });
  });
});
