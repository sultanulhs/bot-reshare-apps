# Fase 6b: Langganan Penjual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement seller subscription system: checkout via QRIS DANA (reusing webhook), subscription activation on payment, expiry job, and gating seller ACTIVE status on active subscription.

**Architecture:** SubscriptionService handles checkout (create DANA QRIS order with SUB_ prefix), webhook routes SUB_ prefixed partnerReferenceNo to subscription handler. BullMQ job expires subscriptions past expiresAt. ActiveSellerGuard enhanced to check subscription status.

**Tech Stack:** NestJS, Prisma, DanaService, BullMQ, PaymentService (QR)

## Global Constraints

- Subscription partnerReferenceNo uses prefix `SUB_` to distinguish from order payments (`ORD_`)
- Webhook handler checks prefix to route to correct handler
- Seller can only sell (status ACTIVE) with an ACTIVE subscription that hasn't expired
- Subscription EXPIRED blocks selling without deleting seller data
- Fee recorded as SUBSCRIPTION_FEE ledger entry
- All amounts in rupiah (integer)

---

### Task 1: SubscriptionService — Checkout & Activation (TDD)

**Files:**
- Create: `backend/src/subscription/subscription.service.ts`
- Create: `backend/src/subscription/subscription.service.spec.ts`
- Create: `backend/src/subscription/dto/checkout.dto.ts`
- Modify: `backend/src/subscription/subscription.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `DanaService`, `PaymentService`, `ConfigService`
- Produces:
  - `SubscriptionService.checkout(sellerId, planId): Promise<{ qrContent, qrImage, partnerReferenceNo }>`
  - `SubscriptionService.activateSubscription(partnerReferenceNo): Promise<void>`
  - `SubscriptionService.getSellerSubscription(sellerId): Promise<Subscription | null>`

- [ ] **Step 1: Write test file `backend/src/subscription/subscription.service.spec.ts`**

```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/subscription/subscription.service.spec.ts --verbose
```

- [ ] **Step 3: Create DTO**

`backend/src/subscription/dto/checkout.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class CheckoutDto {
  @IsString()
  planId!: string;
}
```

- [ ] **Step 4: Create `backend/src/subscription/subscription.service.ts`**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DanaService } from '../dana/dana.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dana: DanaService,
    private readonly payment: PaymentService,
  ) {}

  async checkout(sellerId: string, planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.active) {
      throw new NotFoundException('Subscription plan not found');
    }

    const partnerReferenceNo = `SUB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const danaResult = await this.dana.createQrisOrder({
      partnerReferenceNo,
      amount: plan.price,
      title: `Langganan ${plan.name}`,
    });

    await this.prisma.subscription.create({
      data: {
        sellerId,
        planId,
        partnerReferenceNo,
        status: 'PENDING',
      },
    });

    const qrImage = await this.payment.generateQrImage(danaResult.qrContent);

    return {
      qrContent: danaResult.qrContent,
      qrImage,
      partnerReferenceNo,
    };
  }

  async activateSubscription(partnerReferenceNo: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { partnerReferenceNo },
    });

    if (!sub || sub.status !== 'PENDING') {
      this.logger.log(`Subscription ${partnerReferenceNo} not PENDING, skipping`);
      return;
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: sub.planId },
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (plan?.periodDays ?? 30) * 86400000);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          startedAt: now,
          expiresAt,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId: sub.sellerId,
          orderId: sub.id,
          type: 'SUBSCRIPTION_FEE',
          amount: plan?.price ?? 0,
        },
      });
    });

    this.logger.log(`Subscription ${sub.id} activated until ${expiresAt.toISOString()}`);
  }

  async getSellerSubscription(sellerId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        sellerId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { expiresAt: 'desc' },
    });
  }
}
```

- [ ] **Step 5: Update SubscriptionModule**

```typescript
import { Module } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [DanaModule, PaymentModule],
  providers: [SubscriptionPlanService, SubscriptionService],
  exports: [SubscriptionPlanService, SubscriptionService],
})
export class SubscriptionModule {}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && npx jest src/subscription/subscription.service.spec.ts --verbose
```

Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/subscription/
git commit -m "feat: add SubscriptionService with QRIS checkout and activation"
```

---

### Task 2: Webhook Routing — SUB_ Prefix Handler

**Files:**
- Modify: `backend/src/webhook/fulfilment.service.ts`
- Modify: `backend/src/webhook/webhook.module.ts`

**Interfaces:**
- Consumes: `SubscriptionService`
- Produces: Updated webhook handler that routes SUB_ prefixed payments to subscription activation

- [ ] **Step 1: Update FulfilmentService to handle SUB_ prefix**

Add SubscriptionService injection and route by prefix:

```typescript
// Add to constructor:
private readonly subscriptionService: SubscriptionService,

// Update handlePaymentNotification:
async handlePaymentNotification(body: { originalPartnerReferenceNo: string; [key: string]: any }) {
  const refNo = body.originalPartnerReferenceNo;

  if (refNo.startsWith('SUB_')) {
    await this.subscriptionService.activateSubscription(refNo);
    return;
  }

  // ... existing order fulfilment logic
}
```

- [ ] **Step 2: Update WebhookModule to import SubscriptionModule**

- [ ] **Step 3: Update fulfilment.service.spec.ts — add subscription mock and test**

Add SubscriptionService mock and test case for SUB_ prefix routing.

- [ ] **Step 4: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/webhook/
git commit -m "feat: route SUB_ prefixed webhook payments to subscription activation"
```

---

### Task 3: Seller Subscription Endpoints & Expiry Job

**Files:**
- Create: `backend/src/subscription/subscription-expiry.processor.ts`
- Modify: `backend/src/subscription/subscription.module.ts`
- Modify: `backend/src/mobile/seller.controller.ts`
- Modify: `backend/src/mobile/mobile.module.ts`

**Interfaces:**
- Consumes: `SubscriptionService`, BullMQ
- Produces:
  - `GET /api/seller/subscription` — current subscription status
  - `POST /api/seller/subscription/checkout` — start checkout, returns QR
  - BullMQ cron job to expire stale subscriptions

- [ ] **Step 1: Create expiry processor**

`backend/src/subscription/subscription-expiry.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Processor('subscription-expiry')
export class SubscriptionExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionExpiryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    const now = new Date();
    const expired = await this.prisma.subscription.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} subscriptions`);
    }
  }
}
```

- [ ] **Step 2: Update SubscriptionModule**

Add BullMQ queue registration and processor:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionExpiryProcessor } from './subscription-expiry.processor';
import { DanaModule } from '../dana/dana.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'subscription-expiry' }),
    DanaModule,
    PaymentModule,
  ],
  providers: [SubscriptionPlanService, SubscriptionService, SubscriptionExpiryProcessor],
  exports: [SubscriptionPlanService, SubscriptionService],
})
export class SubscriptionModule {}
```

- [ ] **Step 3: Add subscription endpoints to SellerController**

```typescript
// Add SubscriptionService to constructor
private readonly subscriptionService: SubscriptionService,

// Endpoints:
@Get('subscription')
async getSubscription(@Req() req: any) {
  const seller = await this.sellerService.getStatus(req.user.sub);
  const sub = await this.subscriptionService.getSellerSubscription(seller.id);
  return sub ?? { status: 'NONE', message: 'Tidak ada langganan aktif' };
}

@Post('subscription/checkout')
async subscriptionCheckout(@Req() req: any, @Body() dto: CheckoutDto) {
  const seller = await this.sellerService.getStatus(req.user.sub);
  return this.subscriptionService.checkout(seller.id, dto.planId);
}
```

- [ ] **Step 4: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/subscription/ backend/src/mobile/
git commit -m "feat: add seller subscription endpoints and expiry job"
```
