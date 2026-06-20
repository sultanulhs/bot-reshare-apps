import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

describe('StockService -- Credential Safety', () => {
  let service: StockService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      duration: { findFirst: jest.fn() },
      account: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      subAccount: { create: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CryptoService,
          useValue: {
            encrypt: jest.fn().mockReturnValue({
              ciphertext: 'enc',
              iv: 'iv',
              authTag: 'tag',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  it('listAccounts should NEVER return credential fields', async () => {
    prisma.duration.findFirst.mockResolvedValue({ id: 'dur-1' });
    prisma.account.findMany.mockResolvedValue([
      { id: 'acc-1', durationId: 'dur-1', status: 'AVAILABLE', createdAt: new Date(), _count: { subAccounts: 0 } },
    ]);

    const result = await service.listAccounts('seller-1', 'dur-1');

    result.forEach((item: any) => {
      expect(item).not.toHaveProperty('encEmail');
      expect(item).not.toHaveProperty('encPassword');
      expect(item).not.toHaveProperty('emailIv');
      expect(item).not.toHaveProperty('passwordIv');
    });
  });

  it('addAccount should encrypt credentials before storage', async () => {
    prisma.duration.findFirst.mockResolvedValue({ id: 'dur-1' });
    prisma.account.create.mockResolvedValue({ id: 'acc-1', status: 'AVAILABLE' });

    const encrypt = jest.fn().mockReturnValue({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' });

    const module = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: { encrypt } },
      ],
    }).compile();

    const svc = module.get<StockService>(StockService);
    await svc.addAccount('s1', 'dur-1', { email: 'user@test.com', password: 'secret' });

    expect(encrypt).toHaveBeenCalledWith('user@test.com');
    expect(encrypt).toHaveBeenCalledWith('secret');
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        encEmail: 'enc',
        emailIv: 'iv',
        emailTag: 'tag',
        encPassword: 'enc',
        passwordIv: 'iv',
        passwordTag: 'tag',
      }),
    });
  });
});
