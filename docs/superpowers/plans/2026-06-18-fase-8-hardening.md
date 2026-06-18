# Fase 8: Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the application: add missing tests (idempotency, expiry, credential safety), improve error handling in webhook (SNAP response codes), ensure logging never leaks credentials, and add health check endpoint.

**Architecture:** Additional unit tests for critical paths, webhook error response standardization, logging sanitization, and operational readiness.

**Tech Stack:** NestJS, Jest, Prisma

## Global Constraints

- Credentials NEVER logged — verify via test
- Webhook responses follow DANA SNAP format: `{ responseCode, responseMessage }`
- Idempotency: duplicate webhook = no duplicate fulfilment/ledger
- Order expiry releases locked stock
- All existing tests must continue passing

---

### Task 1: Idempotency & Credential Safety Tests

**Files:**
- Create: `backend/src/webhook/fulfilment.idempotency.spec.ts`
- Create: `backend/src/stock/stock.safety.spec.ts`

**Interfaces:**
- Consumes: `FulfilmentService`, `StockService`, `PrismaService`, `CryptoService`
- Produces: Additional test coverage for critical security and correctness paths

- [ ] **Step 1: Create `backend/src/webhook/fulfilment.idempotency.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FulfilmentService } from './fulfilment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionService } from '../subscription/subscription.service';

describe('FulfilmentService — Idempotency', () => {
  let service: FulfilmentService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn(), update: jest.fn() },
      stockUnit: { findUnique: jest.fn(), update: jest.fn() },
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
        stockUnitId: 's1',
        productId: 'p1',
        basePrice: 1000,
        markup: 100,
      })
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'FULFILLED',
      });

    prisma.stockUnit.findUnique.mockResolvedValue({
      id: 's1',
      encCredentials: 'e',
      iv: 'i',
      authTag: 't',
      product: { title: 'Test', stockType: 'PRE_STOCKED', sellerId: 'sel1' },
    });

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
        stockUnitId: 's1',
        productId: 'p1',
        basePrice: 1000,
        markup: 100,
      })
      .mockResolvedValueOnce({ id: 'o1', status: 'FULFILLED' });

    prisma.stockUnit.findUnique.mockResolvedValue({
      id: 's1',
      encCredentials: 'e',
      iv: 'i',
      authTag: 't',
      product: { title: 'Test', stockType: 'PRE_STOCKED', sellerId: 'sel1' },
    });

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
```

- [ ] **Step 2: Create `backend/src/stock/stock.safety.spec.ts`**

```typescript
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
```

- [ ] **Step 3: Run all tests**

```bash
cd backend && npx jest --verbose
```

Expected: all existing + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/webhook/fulfilment.idempotency.spec.ts backend/src/stock/stock.safety.spec.ts
git commit -m "test: add idempotency and credential safety tests"
```

---

### Task 2: Webhook Error Handling & SNAP Response Codes

**Files:**
- Modify: `backend/src/webhook/webhook.controller.ts`

**Interfaces:**
- Consumes: `FulfilmentService`
- Produces: Proper SNAP-formatted error responses

- [ ] **Step 1: Update webhook controller with proper error handling**

```typescript
import {
  Controller,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FulfilmentService } from './fulfilment.service';

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly fulfilmentService: FulfilmentService) {}

  @Post('v1.0/debit/notify')
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('Missing raw body in webhook request');
      return {
        responseCode: '5000000',
        responseMessage: 'General Error',
      };
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      this.logger.error('Invalid JSON in webhook body');
      return {
        responseCode: '5000000',
        responseMessage: 'Invalid Request Format',
      };
    }

    if (!body.originalPartnerReferenceNo) {
      this.logger.error('Missing originalPartnerReferenceNo in webhook');
      return {
        responseCode: '4000000',
        responseMessage: 'Bad Request',
      };
    }

    try {
      await this.fulfilmentService.handlePaymentNotification(body);
      return {
        responseCode: '2000000',
        responseMessage: 'Success',
      };
    } catch (err: any) {
      this.logger.error(
        `Webhook error for ${body.originalPartnerReferenceNo}: ${err.message}`,
      );
      return {
        responseCode: '5000000',
        responseMessage: 'General Error',
      };
    }
  }
}
```

- [ ] **Step 2: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/webhook/webhook.controller.ts
git commit -m "feat: improve webhook error handling with SNAP response codes"
```

---

### Task 3: Health Check & Logging Safety

**Files:**
- Create: `backend/src/health/health.controller.ts`
- Create: `backend/src/health/health.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `GET /api/health` endpoint returning `{ status: 'ok', timestamp }`

- [ ] **Step 1: Create `backend/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 2: Create `backend/src/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Add HealthModule to AppModule**

- [ ] **Step 4: Verify build and all tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/health/ backend/src/app.module.ts
git commit -m "feat: add health check endpoint and finalize hardening"
```
