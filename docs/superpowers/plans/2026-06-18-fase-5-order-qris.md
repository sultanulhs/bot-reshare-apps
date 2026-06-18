# Fase 5: Order & QRIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the order creation flow: stock locking, markup computation, DANA QRIS order creation (mocked for sandbox), QR rendering, and order expiry via BullMQ timer.

**Architecture:** OrderService orchestrates: lock stock unit → compute markup → create DANA QRIS order → save Order record → return QR. DanaService wraps the DANA SDK (mocked until real credentials). BullMQ delayed job expires stale orders. Bot's confirm callback triggers the flow.

**Tech Stack:** NestJS, Prisma, Redis/BullMQ, MarkupService, qrcode (PNG generation), grammy, cuid for partnerReferenceNo

## Global Constraints

- Stock lock: set StockUnit.status = LOCKED when order created; release to AVAILABLE on expiry/failure
- partnerReferenceNo must be unique per order (use cuid + prefix 'ORD_')
- Markup added ON TOP of basePrice, never deducted from seller price
- Order TTL from env ORDER_TTL_MINUTES (default 15)
- DANA SDK not available — mock DanaService to return fake qrContent
- QR rendered as PNG buffer for Telegram
- Idempotency: same partnerReferenceNo = same order (DB unique constraint)
- All amounts in rupiah (integer)

---

### Task 1: DanaService (Mock) & QR Rendering

**Files:**
- Create: `backend/src/dana/dana.service.ts`
- Create: `backend/src/dana/dana.module.ts`
- Create: `backend/src/payment/payment.service.ts`
- Create: `backend/src/payment/payment.module.ts`

**Interfaces:**
- Consumes: `ConfigService`
- Produces:
  - `DanaService.createQrisOrder(params: { partnerReferenceNo, amount, title }): Promise<{ qrContent: string, danaReferenceNo: string }>`
  - `PaymentService.generateQrImage(qrContent: string): Promise<Buffer>` — PNG buffer

- [ ] **Step 1: Install qrcode**

```bash
cd backend && npm install qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: Create `backend/src/dana/dana.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CreateQrisParams {
  partnerReferenceNo: string;
  amount: number;
  title: string;
}

interface QrisResult {
  qrContent: string;
  danaReferenceNo: string;
}

@Injectable()
export class DanaService {
  private readonly logger = new Logger(DanaService.name);

  constructor(private readonly config: ConfigService) {}

  async createQrisOrder(params: CreateQrisParams): Promise<QrisResult> {
    const env = this.config.get<string>('DANA_ENV');

    if (env === 'sandbox') {
      this.logger.warn(
        `[SANDBOX] Mock QRIS order: ${params.partnerReferenceNo} amount=${params.amount}`,
      );
      return {
        qrContent: `MOCK_QRIS_${params.partnerReferenceNo}_${params.amount}`,
        danaReferenceNo: `DANA_${Date.now()}`,
      };
    }

    throw new Error('Production DANA integration not implemented yet');
  }
}
```

- [ ] **Step 3: Create `backend/src/dana/dana.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DanaService } from './dana.service';

@Module({
  providers: [DanaService],
  exports: [DanaService],
})
export class DanaModule {}
```

- [ ] **Step 4: Create `backend/src/payment/payment.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class PaymentService {
  async generateQrImage(qrContent: string): Promise<Buffer> {
    return QRCode.toBuffer(qrContent, {
      type: 'png',
      width: 300,
      margin: 2,
    });
  }
}
```

- [ ] **Step 5: Create `backend/src/payment/payment.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Module({
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
```

- [ ] **Step 6: Verify build**

```bash
cd backend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/dana/ backend/src/payment/ backend/package.json backend/package-lock.json
git commit -m "feat: add mock DanaService and QR rendering PaymentService"
```

---

### Task 2: OrderService with Stock Locking (TDD)

**Files:**
- Create: `backend/src/order/order.service.ts`
- Create: `backend/src/order/order.service.spec.ts`
- Create: `backend/src/order/order.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `MarkupService`, `DanaService`, `PaymentService`, `ConfigService`
- Produces:
  - `OrderService.createOrder(params: { buyerTgUserId: bigint, productId: string, sellerId: string }): Promise<{ orderId, totalAmount, qrContent, qrImage, expiresAt }>`
  - `OrderService.expireOrder(orderId: string): Promise<void>`

- [ ] **Step 1: Write test file `backend/src/order/order.service.spec.ts`**

```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/order/order.service.spec.ts --verbose
```

- [ ] **Step 3: Create `backend/src/order/order.service.ts`**

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { MarkupService } from '../markup/markup.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';

interface CreateOrderParams {
  buyerTgUserId: bigint;
  productId: string;
  sellerId: string;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markupService: MarkupService,
    private readonly danaService: DanaService,
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
  ) {}

  async createOrder(params: CreateOrderParams) {
    const product = await this.prisma.product.findFirst({
      where: { id: params.productId, sellerId: params.sellerId, active: true },
    });
    if (!product) {
      throw new BadRequestException('Product not available');
    }

    const stockUnit = await this.prisma.stockUnit.findFirst({
      where: { productId: product.id, status: 'AVAILABLE' },
    });
    if (!stockUnit) {
      throw new BadRequestException('No stock available');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.stockUnit.update({
        where: { id: stockUnit.id },
        data: { status: 'LOCKED' },
      });

      const markup = await this.markupService.computeMarkup();
      const totalAmount = product.basePrice + markup;
      const partnerReferenceNo = `ORD_${createId()}`;
      const ttl = this.config.get<number>('ORDER_TTL_MINUTES') ?? 15;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

      const danaResult = await this.danaService.createQrisOrder({
        partnerReferenceNo,
        amount: totalAmount,
        title: product.title,
      });

      const order = await tx.order.create({
        data: {
          buyerTgUserId: params.buyerTgUserId,
          stockUnitId: stockUnit.id,
          productId: product.id,
          basePrice: product.basePrice,
          markup,
          totalAmount,
          partnerReferenceNo,
          danaReferenceNo: danaResult.danaReferenceNo,
          qrContent: danaResult.qrContent,
          expiresAt,
        },
      });

      const qrImage = await this.paymentService.generateQrImage(
        danaResult.qrContent,
      );

      return {
        orderId: order.id,
        totalAmount: order.totalAmount,
        qrContent: order.qrContent,
        qrImage,
        expiresAt: order.expiresAt,
        partnerReferenceNo,
      };
    });
  }

  async expireOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== 'PENDING') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });

      if (order.stockUnitId) {
        await tx.stockUnit.update({
          where: { id: order.stockUnitId },
          data: { status: 'AVAILABLE' },
        });
      }
    });
  }
}
```

- [ ] **Step 4: Create `backend/src/order/order.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { MarkupModule } from '../markup/markup.module';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [MarkupModule, DanaModule, PaymentModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && npx jest src/order/order.service.spec.ts --verbose
```

Expected: 5 tests PASS.

- [ ] **Step 6: Run all tests**

```bash
cd backend && npx jest --verbose
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/order/
git commit -m "feat: add OrderService with stock locking, markup, and DANA QRIS"
```

---

### Task 3: Order Expiry Job (BullMQ)

**Files:**
- Create: `backend/src/order/order-expiry.processor.ts`
- Modify: `backend/src/order/order.module.ts`
- Modify: `backend/src/order/order.service.ts`

**Interfaces:**
- Consumes: `OrderService.expireOrder`, BullMQ Queue
- Produces:
  - `OrderService.scheduleExpiry(orderId: string, delayMs: number): Promise<void>`
  - BullMQ processor that calls expireOrder on delayed job

- [ ] **Step 1: Create `backend/src/order/order-expiry.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrderService } from './order.service';

@Processor('order-expiry')
export class OrderExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(private readonly orderService: OrderService) {
    super();
  }

  async process(job: Job<{ orderId: string }>) {
    this.logger.log(`Expiring order ${job.data.orderId}`);
    await this.orderService.expireOrder(job.data.orderId);
  }
}
```

- [ ] **Step 2: Add scheduleExpiry to OrderService**

Add to order.service.ts:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

// Add to constructor:
@InjectQueue('order-expiry') private readonly expiryQueue: Queue,

// Add method:
async scheduleExpiry(orderId: string, delayMs: number) {
  await this.expiryQueue.add('expire', { orderId }, { delay: delayMs });
}
```

And call it at the end of createOrder, before the return:

```typescript
// After order creation, schedule expiry
await this.expiryQueue.add(
  'expire',
  { orderId: order.id },
  { delay: ttl * 60 * 1000 },
);
```

- [ ] **Step 3: Update OrderModule to register queue**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrderService } from './order.service';
import { OrderExpiryProcessor } from './order-expiry.processor';
import { MarkupModule } from '../markup/markup.module';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'order-expiry' }),
    MarkupModule,
    DanaModule,
    PaymentModule,
  ],
  providers: [OrderService, OrderExpiryProcessor],
  exports: [OrderService],
})
export class OrderModule {}
```

- [ ] **Step 4: Add OrderModule to AppModule**

- [ ] **Step 5: Update order.service.spec.ts mock for queue**

Add to the test's providers:

```typescript
{ provide: 'BullQueue_order-expiry', useValue: { add: jest.fn() } },
```

And update the OrderService provider injection token for the queue. Actually for @InjectQueue, the token is `getQueueToken('order-expiry')` from `@nestjs/bullmq`. Simpler: mock it as:

```typescript
{ provide: 'BullQueue_order-expiry', useValue: { add: jest.fn() } },
```

- [ ] **Step 6: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/order/ backend/src/app.module.ts
git commit -m "feat: add order expiry job with BullMQ delayed queue"
```

---

### Task 4: Bot Integration — Confirm Buy Creates Order

**Files:**
- Modify: `backend/src/telegram/composers/buyer.composer.ts`
- Modify: `backend/src/telegram/telegram.service.ts`
- Modify: `backend/src/telegram/telegram.module.ts`

**Interfaces:**
- Consumes: `OrderService.createOrder`, `PaymentService`
- Produces: Updated `confirm_<productId>` callback that creates a real order and sends QR image

- [ ] **Step 1: Update buyer.composer.ts**

Add OrderService parameter and update the confirm callback:

```typescript
// Add to function signature:
export function createBuyerComposer(
  prisma: PrismaService,
  botConfigService: BotConfigService,
  catalogService: CatalogService,
  orderService: OrderService,
) {
```

Replace the `confirm_<productId>` handler:

```typescript
composer.callbackQuery(/^confirm_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match![1];
  const tgUserId = BigInt(ctx.from.id);

  const affiliation = await prisma.buyerAffiliation.findUnique({
    where: { buyerTgUserId: tgUserId },
  });

  if (!affiliation) {
    await ctx.reply('⚠️ Anda belum terhubung ke toko.');
    return;
  }

  try {
    const order = await orderService.createOrder({
      buyerTgUserId: tgUserId,
      productId,
      sellerId: affiliation.sellerId,
    });

    await ctx.replyWithPhoto(
      new InputFile(order.qrImage, 'qris.png'),
      {
        caption:
          `💳 *Pembayaran QRIS*\n\n` +
          `Total: Rp${order.totalAmount.toLocaleString('id-ID')}\n` +
          `Berlaku sampai: ${order.expiresAt.toLocaleString('id-ID')}\n\n` +
          `Scan QR di atas untuk membayar via DANA.\n` +
          `Order ID: \`${order.orderId}\``,
        parse_mode: 'Markdown',
      },
    );
  } catch (err: any) {
    await ctx.reply(`❌ Gagal membuat pesanan: ${err.message}`);
  }
});
```

Add InputFile import at top:

```typescript
import { InputFile } from 'grammy';
```

- [ ] **Step 2: Update telegram.service.ts**

Add OrderService to constructor and pass to createBuyerComposer:

```typescript
import { OrderService } from '../order/order.service';

// Constructor:
private readonly orderService: OrderService,

// In onModuleInit:
const buyerComposer = createBuyerComposer(
  this.prisma,
  this.botConfigService,
  this.catalogService,
  this.orderService,
);
```

- [ ] **Step 3: Update TelegramModule**

Add OrderModule to imports:

```typescript
import { OrderModule } from '../order/order.module';

@Module({
  imports: [CatalogModule, BotConfigModule, OrderModule],
  ...
})
```

- [ ] **Step 4: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/
git commit -m "feat: integrate order creation with bot confirm flow and QR display"
```
