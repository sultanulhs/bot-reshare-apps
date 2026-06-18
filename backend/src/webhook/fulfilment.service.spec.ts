import { Test, TestingModule } from '@nestjs/testing';
import { FulfilmentService } from './fulfilment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';

describe('FulfilmentService', () => {
  let service: FulfilmentService;
  let prisma: any;
  let crypto: any;
  let telegram: any;

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      stockUnit: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      decrypt: jest.fn().mockReturnValue('user@example.com:password123'),
    };

    telegram = {
      bot: {
        api: {
          sendMessage: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FulfilmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: TelegramService, useValue: telegram },
      ],
    }).compile();

    service = module.get<FulfilmentService>(FulfilmentService);
  });

  describe('handlePaymentNotification', () => {
    it('should fulfil a PENDING order with PRE_STOCKED product', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        buyerTgUserId: BigInt(12345),
        stockUnitId: 'stock-1',
        productId: 'prod-1',
        basePrice: 50000,
        markup: 300,
      });

      prisma.stockUnit.findUnique.mockResolvedValue({
        id: 'stock-1',
        encCredentials: 'enc',
        iv: 'iv',
        authTag: 'tag',
        product: { title: 'Netflix', stockType: 'PRE_STOCKED', sellerId: 'seller-1' },
      });

      prisma.order.update.mockResolvedValue({ status: 'FULFILLED' });

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'ORD_test123',
      });

      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { partnerReferenceNo: 'ORD_test123' },
      });
      expect(crypto.decrypt).toHaveBeenCalledWith('enc', 'iv', 'tag');
      expect(telegram.bot.api.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('user@example.com:password123'),
      );
      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent — skip already FULFILLED orders', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'FULFILLED',
      });

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'ORD_test123',
      });

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(telegram.bot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should set ON_DEMAND order to WAITING_SELLER', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        buyerTgUserId: BigInt(12345),
        stockUnitId: null,
        productId: 'prod-1',
        basePrice: 50000,
        markup: 300,
      });

      prisma.order.update.mockResolvedValue({ status: 'WAITING_SELLER' });

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'ORD_ondemand',
      });

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WAITING_SELLER' }),
        }),
      );
    });

    it('should ignore unknown partnerReferenceNo', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'UNKNOWN',
      });

      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
