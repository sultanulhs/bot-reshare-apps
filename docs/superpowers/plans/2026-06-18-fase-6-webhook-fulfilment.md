# Fase 6: Webhook & Fulfilment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the DANA webhook handler at `/v1.0/debit/notify`, signature verification (mocked for sandbox), idempotent order fulfilment (credential delivery to buyer via bot, ledger recording), and support for both PRE_STOCKED (instant) and ON_DEMAND (waiting seller) flows.

**Architecture:** WebhookController receives raw body at `/v1.0/debit/notify` (excluded from /api prefix). Verifies signature, then routes to FulfilmentService which handles idempotent order completion: decrypt credentials → send to buyer via bot → record ledger entries. ON_DEMAND orders go to WAITING_SELLER status instead.

**Tech Stack:** NestJS, Prisma, CryptoService, TelegramService (bot), LedgerService

## Global Constraints

- Webhook path `/v1.0/debit/notify` byte-for-byte, NOT affected by /api prefix
- Verify signature on RAW BODY before any action (mocked in sandbox)
- Idempotency: same partnerReferenceNo → same fulfilment, never duplicate
- Credential delivery ONLY after successful verification
- Ledger: SELLER_CREDIT (full basePrice to seller) + OPERATOR_MARKUP (markup to operator)
- PRE_STOCKED: instant credential delivery → FULFILLED
- ON_DEMAND: no stock unit, set WAITING_SELLER, notify seller
- Credentials decrypted in memory only, never logged

---

### Task 1: Webhook Controller & Signature Verification

**Files:**
- Create: `backend/src/webhook/webhook.controller.ts`
- Create: `backend/src/webhook/webhook.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: Raw request body, `DanaService`
- Produces: `POST /v1.0/debit/notify` endpoint that parses webhook payload and delegates to fulfilment

- [ ] **Step 1: Create `backend/src/webhook/webhook.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Headers,
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
      this.logger.error('No raw body available');
      return { responseCode: '5000000', responseMessage: 'General Error' };
    }

    const body = JSON.parse(rawBody.toString('utf-8'));

    // TODO: In production, verify DANA signature against rawBody
    // For sandbox, skip signature verification
    this.logger.log(
      `Webhook received: partnerReferenceNo=${body.originalPartnerReferenceNo}`,
    );

    try {
      await this.fulfilmentService.handlePaymentNotification(body);
      return { responseCode: '2000000', responseMessage: 'Success' };
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { responseCode: '5000000', responseMessage: 'General Error' };
    }
  }
}
```

- [ ] **Step 2: Create FulfilmentService placeholder**

`backend/src/webhook/fulfilment.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  async handlePaymentNotification(body: any) {
    this.logger.log('Payment notification received — fulfilment pending implementation');
  }
}
```

- [ ] **Step 3: Create `backend/src/webhook/webhook.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { FulfilmentService } from './fulfilment.service';

@Module({
  controllers: [WebhookController],
  providers: [FulfilmentService],
  exports: [FulfilmentService],
})
export class WebhookModule {}
```

- [ ] **Step 4: Add WebhookModule to AppModule**

- [ ] **Step 5: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/webhook/ backend/src/app.module.ts
git commit -m "feat: add webhook controller at /v1.0/debit/notify with raw body parsing"
```

---

### Task 2: Fulfilment Service — Idempotent Order Completion (TDD)

**Files:**
- Modify: `backend/src/webhook/fulfilment.service.ts`
- Create: `backend/src/webhook/fulfilment.service.spec.ts`
- Modify: `backend/src/webhook/webhook.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`, `TelegramService` (bot), `LedgerService`
- Produces:
  - `FulfilmentService.handlePaymentNotification(body)` — idempotent: finds order by partnerReferenceNo, if PENDING → fulfil
  - `FulfilmentService.fulfilOrder(orderId)` — decrypts credentials, sends to buyer via bot, records ledger, sets FULFILLED

- [ ] **Step 1: Write test file `backend/src/webhook/fulfilment.service.spec.ts`**

```typescript
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
        product: { title: 'Netflix', stockType: 'PRE_STOCKED' },
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

      prisma.stockUnit.findUnique.mockResolvedValue(null);

      // Need to check product stockType
      prisma.order.findUnique.mockResolvedValueOnce({
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/webhook/fulfilment.service.spec.ts --verbose
```

- [ ] **Step 3: Implement `backend/src/webhook/fulfilment.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly telegram: TelegramService,
  ) {}

  async handlePaymentNotification(body: {
    originalPartnerReferenceNo: string;
    [key: string]: any;
  }) {
    const refNo = body.originalPartnerReferenceNo;

    const order = await this.prisma.order.findUnique({
      where: { partnerReferenceNo: refNo },
    });

    if (!order) {
      this.logger.warn(`Order not found for ref: ${refNo}`);
      return;
    }

    if (order.status !== 'PENDING') {
      this.logger.log(`Order ${order.id} already ${order.status}, skipping`);
      return;
    }

    if (order.stockUnitId) {
      const stockUnit = await this.prisma.stockUnit.findUnique({
        where: { id: order.stockUnitId },
        include: { product: { select: { title: true, stockType: true } } },
      });

      if (stockUnit && stockUnit.product.stockType === 'PRE_STOCKED') {
        await this.fulfilPreStocked(order, stockUnit);
        return;
      }
    }

    await this.setWaitingSeller(order);
  }

  private async fulfilPreStocked(order: any, stockUnit: any) {
    const credentials = this.crypto.decrypt(
      stockUnit.encCredentials,
      stockUnit.iv,
      stockUnit.authTag,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FULFILLED', fulfilledAt: new Date() },
      });

      await tx.stockUnit.update({
        where: { id: stockUnit.id },
        data: { status: 'SOLD' },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId: stockUnit.product?.sellerId ?? null,
          orderId: order.id,
          type: 'SELLER_CREDIT',
          amount: order.basePrice,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          orderId: order.id,
          type: 'OPERATOR_MARKUP',
          amount: order.markup,
        },
      });
    });

    try {
      await this.telegram.bot.api.sendMessage(
        order.buyerTgUserId.toString(),
        `✅ Pembayaran berhasil!\n\n` +
          `📦 Produk: ${stockUnit.product.title}\n` +
          `🔑 Kredensial:\n${credentials}\n\n` +
          `Simpan dengan aman. Gunakan /report jika ada masalah.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send credentials to buyer: ${err.message}`);
    }

    this.logger.log(`Order ${order.id} fulfilled (PRE_STOCKED)`);
  }

  private async setWaitingSeller(order: any) {
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'WAITING_SELLER' },
    });

    await this.telegram.bot.api.sendMessage(
      order.buyerTgUserId.toString(),
      `💰 Pembayaran berhasil!\n\n` +
        `⏳ Pesanan sedang disiapkan oleh penjual. Anda akan menerima kredensial segera.`,
    );

    this.logger.log(`Order ${order.id} set to WAITING_SELLER`);
  }
}
```

- [ ] **Step 4: Update WebhookModule to import dependencies**

```typescript
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { FulfilmentService } from './fulfilment.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [WebhookController],
  providers: [FulfilmentService],
  exports: [FulfilmentService],
})
export class WebhookModule {}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && npx jest src/webhook/fulfilment.service.spec.ts --verbose
```

Expected: 4 tests PASS.

- [ ] **Step 6: Run all tests**

```bash
cd backend && npx jest --verbose
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/webhook/
git commit -m "feat: add idempotent fulfilment service with credential delivery and ledger"
```

---

### Task 3: Seller On-Demand Fulfil Endpoint

**Files:**
- Create: `backend/src/order/dto/fulfil-order.dto.ts`
- Modify: `backend/src/order/order.service.ts`
- Modify: `backend/src/mobile/seller.controller.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`, `TelegramService`
- Produces:
  - `OrderService.getSellerPendingFulfillments(sellerId): Promise<Order[]>`
  - `OrderService.fulfilOnDemand(sellerId, orderId, credentials): Promise<void>`
  - `GET /api/seller/pending-fulfillments`
  - `POST /api/seller/orders/:id/fulfill`

- [ ] **Step 1: Create DTO**

`backend/src/order/dto/fulfil-order.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class FulfilOrderDto {
  @IsString()
  @MinLength(1)
  credentials!: string;
}
```

- [ ] **Step 2: Add methods to OrderService**

```typescript
async getSellerPendingFulfillments(sellerId: string) {
  return this.prisma.order.findMany({
    where: {
      status: 'WAITING_SELLER',
      stockUnit: { product: { sellerId } },
    },
    include: {
      stockUnit: { select: { product: { select: { title: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

Note: For ON_DEMAND orders without stockUnitId, we need to filter by productId→sellerId instead. Adjust the where clause:

```typescript
async getSellerPendingFulfillments(sellerId: string) {
  return this.prisma.order.findMany({
    where: {
      status: 'WAITING_SELLER',
      product: { sellerId },
    },
    include: {
      product: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

- [ ] **Step 3: Add fulfilOnDemand to OrderService**

This method requires CryptoService and TelegramService. Add them to OrderService or create a separate method. Since OrderService already has many deps, add CryptoService and TelegramService:

```typescript
async fulfilOnDemand(sellerId: string, orderId: string, credentials: string) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true },
  });

  if (!order || order.status !== 'WAITING_SELLER') {
    throw new BadRequestException('Order not in WAITING_SELLER status');
  }
  if (order.product.sellerId !== sellerId) {
    throw new BadRequestException('Order does not belong to this seller');
  }

  const encrypted = this.cryptoService.encrypt(credentials);

  await this.prisma.$transaction(async (tx) => {
    const stockUnit = await tx.stockUnit.create({
      data: {
        productId: order.productId,
        encCredentials: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        status: 'SOLD',
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'FULFILLED',
        fulfilledAt: new Date(),
        stockUnitId: stockUnit.id,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        sellerId,
        orderId: order.id,
        type: 'SELLER_CREDIT',
        amount: order.basePrice,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        orderId: order.id,
        type: 'OPERATOR_MARKUP',
        amount: order.markup,
      },
    });
  });

  try {
    await this.telegramService.bot.api.sendMessage(
      order.buyerTgUserId.toString(),
      `✅ Kredensial sudah siap!\n\n📦 ${order.product.title}\n🔑 ${credentials}\n\nSimpan dengan aman.`,
    );
  } catch (err: any) {
    // Log but don't fail
  }
}
```

- [ ] **Step 4: Add endpoints to SellerController**

```typescript
@Get('pending-fulfillments')
@UseGuards(ActiveSellerGuard)
getPendingFulfillments(@Req() req: any) {
  return this.orderService.getSellerPendingFulfillments(req.seller.id);
}

@Post('orders/:id/fulfill')
@UseGuards(ActiveSellerGuard)
fulfilOrder(
  @Req() req: any,
  @Param('id') id: string,
  @Body() dto: FulfilOrderDto,
) {
  return this.orderService.fulfilOnDemand(req.seller.id, id, dto.credentials);
}
```

- [ ] **Step 5: Update imports — add OrderService to SellerController, OrderModule to MobileModule**

- [ ] **Step 6: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/order/ backend/src/mobile/
git commit -m "feat: add on-demand fulfilment endpoint for sellers"
```
