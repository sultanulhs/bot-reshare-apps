import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarkupService } from '../markup/markup.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('OrderService', () => {
  let service: OrderService;
  let prisma: any;
  let markup: any;
  let dana: any;
  let payment: any;

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      stockUnit: { findFirst: jest.fn(), update: jest.fn() },
      order: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    markup = { computeMarkup: jest.fn().mockResolvedValue(300) };
    dana = {
      createQrisOrder: jest.fn().mockResolvedValue({
        qrContent: 'MOCK_QR',
        danaReferenceNo: 'DANA_123',
      }),
    };
    payment = {
      generateQrImage: jest.fn().mockResolvedValue(Buffer.from('PNG')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: MarkupService, useValue: markup },
        { provide: DanaService, useValue: dana },
        { provide: PaymentService, useValue: payment },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'ORDER_TTL_MINUTES' ? 15 : undefined) },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder', () => {
    it('should lock stock, compute markup, create DANA order, and save', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        basePrice: 50000,
        active: true,
        stockType: 'PRE_STOCKED',
      });
      prisma.stockUnit.findFirst.mockResolvedValue({ id: 'stock-1' });
      prisma.stockUnit.update.mockResolvedValue({ id: 'stock-1', status: 'LOCKED' });
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        totalAmount: 50300,
        qrContent: 'MOCK_QR',
        expiresAt: new Date(),
        partnerReferenceNo: 'ORD_test',
      });

      const result = await service.createOrder({
        buyerTgUserId: BigInt(12345),
        productId: 'prod-1',
        sellerId: 'seller-1',
      });

      expect(result.totalAmount).toBe(50300);
      expect(markup.computeMarkup).toHaveBeenCalled();
      expect(dana.createQrisOrder).toHaveBeenCalled();
      expect(prisma.stockUnit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'LOCKED' },
        }),
      );
    });

    it('should throw if no available stock', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        basePrice: 50000,
        active: true,
      });
      prisma.stockUnit.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder({
          buyerTgUserId: BigInt(12345),
          productId: 'prod-1',
          sellerId: 'seller-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder({
          buyerTgUserId: BigInt(12345),
          productId: 'nonexistent',
          sellerId: 'seller-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('expireOrder', () => {
    it('should set order EXPIRED and release stock to AVAILABLE', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        stockUnitId: 'stock-1',
      });
      prisma.order.update.mockResolvedValue({ status: 'EXPIRED' });
      prisma.stockUnit.update.mockResolvedValue({ status: 'AVAILABLE' });

      await service.expireOrder('order-1');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'EXPIRED' },
        }),
      );
      expect(prisma.stockUnit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'AVAILABLE' },
        }),
      );
    });

    it('should skip if order already fulfilled', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'FULFILLED',
      });

      await service.expireOrder('order-1');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
