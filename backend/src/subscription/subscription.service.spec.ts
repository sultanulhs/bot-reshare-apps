import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';
import { NotFoundException } from '@nestjs/common';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: any;
  let dana: any;
  let payment: any;

  beforeEach(async () => {
    prisma = {
      subscriptionPlan: { findUnique: jest.fn() },
      subscription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      ledgerEntry: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    dana = {
      createQrisOrder: jest.fn().mockResolvedValue({
        qrContent: 'MOCK_SUB_QR',
        danaReferenceNo: 'DANA_SUB_123',
      }),
    };

    payment = {
      generateQrImage: jest.fn().mockResolvedValue(Buffer.from('PNG')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: DanaService, useValue: dana },
        { provide: PaymentService, useValue: payment },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  describe('checkout', () => {
    it('should create subscription and return QR', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Bulanan',
        price: 50000,
        periodDays: 30,
        active: true,
      });
      prisma.subscription.create.mockResolvedValue({
        id: 'sub-1',
        partnerReferenceNo: 'SUB_test',
      });

      const result = await service.checkout('seller-1', 'plan-1');

      expect(result.qrContent).toBe('MOCK_SUB_QR');
      expect(result.qrImage).toBeDefined();
      expect(dana.createQrisOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          title: expect.stringContaining('Bulanan'),
        }),
      );
    });

    it('should throw if plan not found', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(service.checkout('seller-1', 'bad-plan')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateSubscription', () => {
    it('should activate PENDING subscription and record fee', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        sellerId: 'seller-1',
        planId: 'plan-1',
        status: 'PENDING',
      });
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        periodDays: 30,
        price: 50000,
      });
      prisma.subscription.update.mockResolvedValue({ status: 'ACTIVE' });

      await service.activateSubscription('SUB_test');

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SUBSCRIPTION_FEE',
          amount: 50000,
        }),
      });
    });

    it('should skip already ACTIVE subscription (idempotent)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });

      await service.activateSubscription('SUB_test');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('getSellerSubscription', () => {
    it('should return active subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await service.getSellerSubscription('seller-1');
      expect(result).toBeDefined();
      expect(result!.status).toBe('ACTIVE');
    });
  });
});
