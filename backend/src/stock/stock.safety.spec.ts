import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

describe('StockService — Credential Safety', () => {
  let service: StockService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      stockUnit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
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

  it('listStock should NEVER return encCredentials, iv, or authTag', async () => {
    prisma.stockUnit.findMany.mockResolvedValue([
      { id: 's1', productId: 'p1', status: 'AVAILABLE', createdAt: new Date() },
    ]);

    const result = await service.listStock('seller-1', {});

    result.forEach((item: any) => {
      expect(item).not.toHaveProperty('encCredentials');
      expect(item).not.toHaveProperty('iv');
      expect(item).not.toHaveProperty('authTag');
    });
  });

  it('addStock should encrypt credentials before storage', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', sellerId: 's1' });
    prisma.stockUnit.create.mockResolvedValue({ id: 'su1', status: 'AVAILABLE' });

    const encrypt = jest.fn().mockReturnValue({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' });

    const module = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: { encrypt } },
      ],
    }).compile();

    const svc = module.get<StockService>(StockService);
    await svc.addStock('s1', 'p1', { credentials: 'plaintext-secret' });

    expect(encrypt).toHaveBeenCalledWith('plaintext-secret');
    expect(prisma.stockUnit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        encCredentials: 'enc',
        iv: 'iv',
        authTag: 'tag',
      }),
    });
  });
});
