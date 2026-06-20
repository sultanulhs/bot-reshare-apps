import { Test, TestingModule } from '@nestjs/testing';
import { FulfilmentService } from './fulfilment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionService } from '../subscription/subscription.service';

describe('FulfilmentService', () => {
  let service: FulfilmentService;
  let prisma: any;
  let crypto: any;
  let telegram: any;
  let subscriptionService: any;

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      account: {
        update: jest.fn(),
      },
      subAccount: {
        updateMany: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      decrypt: jest.fn().mockReturnValue('decrypted-value'),
    };

    telegram = {
      bot: {
        api: {
          sendMessage: jest.fn(),
        },
      },
    };

    subscriptionService = {
      activateSubscription: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FulfilmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: TelegramService, useValue: telegram },
        { provide: SubscriptionService, useValue: subscriptionService },
      ],
    }).compile();

    service = module.get<FulfilmentService>(FulfilmentService);
  });

  describe('handlePaymentNotification', () => {
    it('should fulfil a PENDING order with AKUN_READY product', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        buyerTgUserId: BigInt(12345),
        basePrice: 50000,
        markup: 300,
        duration: {
          productType: 'AKUN_READY',
          label: '1 Bulan',
          app: { name: 'Netflix', sellerId: 'seller-1' },
        },
        account: {
          id: 'acc-1',
          encEmail: 'enc-email',
          emailIv: 'iv1',
          emailTag: 'tag1',
          encPassword: 'enc-pass',
          passwordIv: 'iv2',
          passwordTag: 'tag2',
          subAccounts: [],
        },
        subAccount: null,
      });

      prisma.order.update.mockResolvedValue({ status: 'FULFILLED' });
      prisma.account.update.mockResolvedValue({});

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'ORD_test123',
      });

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { partnerReferenceNo: 'ORD_test123' },
        }),
      );
      expect(crypto.decrypt).toHaveBeenCalled();
      expect(telegram.bot.api.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('decrypted-value'),
      );
      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent -- skip already FULFILLED orders', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'FULFILLED',
        duration: { productType: 'AKUN_READY', app: { sellerId: 'seller-1' } },
        account: null,
        subAccount: null,
      });

      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'ORD_test123',
      });

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(telegram.bot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should set MANUAL order to WAITING_SELLER', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING',
        buyerTgUserId: BigInt(12345),
        basePrice: 50000,
        markup: 300,
        duration: {
          productType: 'MANUAL',
          label: '1 Bulan',
          app: { name: 'Custom App', sellerId: 'seller-1' },
        },
        account: null,
        subAccount: null,
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

    it('should route SUB_ prefixed payments to subscription activation', async () => {
      await service.handlePaymentNotification({
        originalPartnerReferenceNo: 'SUB_1234567890_abc123',
      });

      expect(subscriptionService.activateSubscription).toHaveBeenCalledWith(
        'SUB_1234567890_abc123',
      );
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });
  });
});
