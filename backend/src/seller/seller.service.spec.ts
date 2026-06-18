import { Test, TestingModule } from '@nestjs/testing';
import { SellerService } from './seller.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SellerService', () => {
  let service: SellerService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      seller: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sellerProfile: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'enc-payout',
        iv: 'iv-123',
        authTag: 'tag-456',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<SellerService>(SellerService);
  });

  describe('getStatus', () => {
    it('should return seller status for a valid user', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        name: 'Test Seller',
        status: 'PENDING',
        storeCode: null,
        user: { email: 'test@test.com' },
      });

      const result = await service.getStatus('user-1');
      expect(result).toEqual({
        id: 'seller-1',
        name: 'Test Seller',
        status: 'PENDING',
        email: 'test@test.com',
        storeCode: null,
      });
    });

    it('should throw NotFoundException if no seller for user', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('no-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitProfile', () => {
    it('should encrypt payout and create profile when status is APPROVED', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: 'APPROVED',
        profile: null,
      });
      prisma.sellerProfile.create.mockResolvedValue({});
      prisma.seller.update.mockResolvedValue({ status: 'PROFILE_SUBMITTED' });

      const result = await service.submitProfile('user-1', {
        payoutAccount: 'BCA 1234567890',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('BCA 1234567890');
      expect(prisma.sellerProfile.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-1',
          encPayout: 'enc-payout',
          payoutIv: 'iv-123',
          payoutTag: 'tag-456',
        },
      });
      expect(result.status).toBe('PROFILE_SUBMITTED');
    });

    it('should throw BadRequestException if status is not APPROVED', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: 'PENDING',
      });

      await expect(
        service.submitProfile('user-1', { payoutAccount: 'BCA 123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if no seller', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);

      await expect(
        service.submitProfile('no-user', { payoutAccount: 'BCA 123' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
