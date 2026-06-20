import { Test, TestingModule } from '@nestjs/testing';
import { FulfilmentService } from './fulfilment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionService } from '../subscription/subscription.service';

describe('FulfilmentService -- Idempotency', () => {
  let service: FulfilmentService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn(), update: jest.fn() },
      account: { update: jest.fn() },
      subAccount: { updateMany: jest.fn() },
      ledgerEntry: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FulfilmentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CryptoService,
          useValue: { decrypt: jest.fn().mockReturnValue('creds') },
        },
        {
          provide: TelegramService,
          useValue: { bot: { api: { sendMessage: jest.fn() } } },
        },
        {
          provide: SubscriptionService,
          useValue: { activateSubscription: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<FulfilmentService>(FulfilmentService);
  });

  it('should not create duplicate ledger entries on repeated webhook', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'PENDING',
        buyerTgUserId: BigInt(1),
        basePrice: 1000,
        markup: 100,
        duration: {
          productType: 'AKUN_READY',
          label: '1 Bulan',
          app: { name: 'Test', sellerId: 'sel1' },
        },
        account: {
          id: 'acc-1',
          encEmail: 'e',
          emailIv: 'i',
          emailTag: 't',
          encPassword: 'e',
          passwordIv: 'i',
          passwordTag: 't',
          subAccounts: [],
        },
        subAccount: null,
      })
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'FULFILLED',
        duration: { productType: 'AKUN_READY', app: { sellerId: 'sel1' } },
        account: null,
        subAccount: null,
      });

    prisma.order.update.mockResolvedValue({ status: 'FULFILLED' });
    prisma.account.update.mockResolvedValue({});

    await service.handlePaymentNotification({ originalPartnerReferenceNo: 'ORD_1' });
    await service.handlePaymentNotification({ originalPartnerReferenceNo: 'ORD_1' });

    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
  });

  it('should not send credentials twice on repeated webhook', async () => {
    const sendMessage = jest.fn();

    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'PENDING',
        buyerTgUserId: BigInt(1),
        basePrice: 1000,
        markup: 100,
        duration: {
          productType: 'AKUN_READY',
          label: '1 Bulan',
          app: { name: 'Test', sellerId: 'sel1' },
        },
        account: {
          id: 'acc-1',
          encEmail: 'e',
          emailIv: 'i',
          emailTag: 't',
          encPassword: 'e',
          passwordIv: 'i',
          passwordTag: 't',
          subAccounts: [],
        },
        subAccount: null,
      })
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'FULFILLED',
        duration: { productType: 'AKUN_READY', app: { sellerId: 'sel1' } },
        account: null,
        subAccount: null,
      });

    prisma.order.update.mockResolvedValue({ status: 'FULFILLED' });
    prisma.account.update.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        FulfilmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: { decrypt: jest.fn().mockReturnValue('creds') } },
        { provide: TelegramService, useValue: { bot: { api: { sendMessage } } } },
        { provide: SubscriptionService, useValue: { activateSubscription: jest.fn() } },
      ],
    }).compile();

    const svc = module.get<FulfilmentService>(FulfilmentService);
    await svc.handlePaymentNotification({ originalPartnerReferenceNo: 'ORD_1' });
    await svc.handlePaymentNotification({ originalPartnerReferenceNo: 'ORD_1' });

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
