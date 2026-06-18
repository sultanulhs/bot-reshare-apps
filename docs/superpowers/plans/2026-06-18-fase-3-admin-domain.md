# Fase 3: Admin Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement admin domain: seller approval/suspension with storeCode generation, markup configuration (FIXED/RANDOM), subscription plan management, bot config, stats dashboard, and order management with resend capability.

**Architecture:** Admin controllers behind JwtAuthGuard + RolesGuard(ADMIN). MarkupService computes markup per configured mode. BotConfigService manages bot configuration. All admin endpoints under `/api/admin/*`.

**Tech Stack:** NestJS, Prisma, CryptoService (for decrypting payout on admin view), JwtAuthGuard + RolesGuard (from Fase 1), class-validator DTOs

## Global Constraints

- TypeScript strict mode enabled
- All endpoints require JWT + role ADMIN
- Seller approval generates storeCode (locked after creation in MVP)
- Payout account decryption for admin view must be AUDITED (log who, when, which seller)
- Markup: FIXED uses markupValue; RANDOM uses markupMin..markupMax. All values >= 0. RANDOM requires markupMin <= markupMax
- Seller always receives FULL price. Markup added ON TOP, never deducted
- Credentials never returned in any admin response (resend sends via bot only)
- All amounts in rupiah (integer)
- cuid() for all primary keys

---

### Task 1: Admin Seller Management Service

**Files:**
- Create: `backend/src/seller/admin-seller.service.ts`
- Create: `backend/src/seller/admin-seller.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`
- Produces:
  - `AdminSellerService.listSellers(status?: string): Promise<SellerListItem[]>`
  - `AdminSellerService.getSellerDetail(sellerId: string): Promise<SellerDetail>` — decrypts payout for PROFILE_SUBMITTED/ACTIVE, AUDITED
  - `AdminSellerService.approveSeller(sellerId: string): Promise<{ id, status, storeCode }>` — PENDING→APPROVED, generates storeCode
  - `AdminSellerService.verifyProfile(sellerId: string): Promise<{ id, status }>` — PROFILE_SUBMITTED→ACTIVE
  - `AdminSellerService.rejectSeller(sellerId: string, reason: string): Promise<{ id, status }>`
  - `AdminSellerService.suspendSeller(sellerId: string, reason: string): Promise<{ id, status }>`

- [ ] **Step 1: Write test file `backend/src/seller/admin-seller.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AdminSellerService } from './admin-seller.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AdminSellerService', () => {
  let service: AdminSellerService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      seller: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      decrypt: jest.fn().mockReturnValue('BCA 1234567890'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSellerService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<AdminSellerService>(AdminSellerService);
  });

  describe('listSellers', () => {
    it('should return sellers with product count', async () => {
      prisma.seller.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Seller1',
          phone: '081',
          status: 'PENDING',
          createdAt: new Date(),
          user: { email: 'test@test.com' },
          _count: { products: 3 },
        },
      ]);

      const result = await service.listSellers();
      expect(result[0].name).toBe('Seller1');
      expect(result[0].productCount).toBe(3);
    });
  });

  describe('approveSeller', () => {
    it('should transition PENDING to APPROVED and generate storeCode', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'PENDING' });
      prisma.seller.update.mockResolvedValue({
        id: 's1',
        status: 'APPROVED',
        storeCode: 'store_abc123',
      });

      const result = await service.approveSeller('s1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.seller.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({
            status: 'APPROVED',
            storeCode: expect.stringMatching(/^store_/),
          }),
        }),
      );
    });

    it('should throw if seller not PENDING', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
      await expect(service.approveSeller('s1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyProfile', () => {
    it('should transition PROFILE_SUBMITTED to ACTIVE', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'PROFILE_SUBMITTED' });
      prisma.seller.update.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

      const result = await service.verifyProfile('s1');
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw if not PROFILE_SUBMITTED', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'APPROVED' });
      await expect(service.verifyProfile('s1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('suspendSeller', () => {
    it('should suspend any seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
      prisma.seller.update.mockResolvedValue({ id: 's1', status: 'SUSPENDED' });

      const result = await service.suspendSeller('s1', 'violation');
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('getSellerDetail', () => {
    it('should return decrypted payout for PROFILE_SUBMITTED seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        name: 'Seller',
        phone: '081',
        status: 'PROFILE_SUBMITTED',
        user: { email: 'test@test.com' },
        profile: {
          encPayout: 'enc',
          payoutIv: 'iv',
          payoutTag: 'tag',
        },
      });

      const result = await service.getSellerDetail('s1');
      expect(result.profile?.payoutAccount).toBe('BCA 1234567890');
      expect(crypto.decrypt).toHaveBeenCalledWith('enc', 'iv', 'tag');
    });

    it('should not include profile for PENDING seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        name: 'Seller',
        phone: '081',
        status: 'PENDING',
        user: { email: 'test@test.com' },
        profile: null,
      });

      const result = await service.getSellerDetail('s1');
      expect(result.profile).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/seller/admin-seller.service.spec.ts --verbose
```

- [ ] **Step 3: Create `backend/src/seller/admin-seller.service.ts`**

```typescript
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { randomBytes } from 'node:crypto';

@Injectable()
export class AdminSellerService {
  private readonly logger = new Logger(AdminSellerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async listSellers(status?: string) {
    const where = status ? { status: status as any } : {};
    const sellers = await this.prisma.seller.findMany({
      where,
      include: {
        user: { select: { email: true } },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sellers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.user.email,
      phone: s.phone,
      status: s.status,
      productCount: s._count.products,
      createdAt: s.createdAt,
    }));
  }

  async getSellerDetail(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: {
        user: { select: { email: true } },
        profile: true,
      },
    });

    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    const base = {
      id: seller.id,
      name: seller.name,
      email: seller.user.email,
      phone: seller.phone,
      status: seller.status,
    };

    if (
      seller.profile &&
      (seller.status === 'PROFILE_SUBMITTED' || seller.status === 'ACTIVE')
    ) {
      this.logger.log(
        `AUDIT: Admin viewed payout for seller ${seller.id}`,
      );

      const payoutAccount = this.crypto.decrypt(
        seller.profile.encPayout,
        seller.profile.payoutIv,
        seller.profile.payoutTag,
      );

      return { ...base, profile: { payoutAccount } };
    }

    return base;
  }

  async approveSeller(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    if (seller.status !== 'PENDING') {
      throw new BadRequestException('Can only approve PENDING sellers');
    }

    const storeCode = `store_${randomBytes(6).toString('hex')}`;

    const updated = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status: 'APPROVED', storeCode },
    });

    return { id: updated.id, status: updated.status, storeCode: updated.storeCode };
  }

  async verifyProfile(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    if (seller.status !== 'PROFILE_SUBMITTED') {
      throw new BadRequestException('Can only verify PROFILE_SUBMITTED sellers');
    }

    const updated = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status: 'ACTIVE' },
    });

    return { id: updated.id, status: updated.status };
  }

  async rejectSeller(sellerId: string, reason: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const updated = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status: 'SUSPENDED' },
    });

    this.logger.log(`Seller ${sellerId} rejected: ${reason}`);
    return { id: updated.id, status: updated.status };
  }

  async suspendSeller(sellerId: string, reason: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const updated = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status: 'SUSPENDED' },
    });

    this.logger.log(`Seller ${sellerId} suspended: ${reason}`);
    return { id: updated.id, status: updated.status };
  }
}
```

- [ ] **Step 4: Export from SellerModule**

Add `AdminSellerService` to providers and exports in `backend/src/seller/seller.module.ts`.

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && npx jest src/seller/admin-seller.service.spec.ts --verbose
```

Expected: 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/seller/
git commit -m "feat: add AdminSellerService with approval, verification, and suspension"
```

---

### Task 2: Markup Service (with TDD)

**Files:**
- Create: `backend/src/markup/markup.service.ts`
- Create: `backend/src/markup/markup.service.spec.ts`
- Create: `backend/src/markup/dto/update-markup.dto.ts`
- Create: `backend/src/markup/markup.module.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  - `MarkupService.getConfig(): Promise<MarkupConfig>`
  - `MarkupService.updateConfig(dto: UpdateMarkupDto): Promise<MarkupConfig>`
  - `MarkupService.computeMarkup(): Promise<number>` — returns integer based on active mode
  - `UpdateMarkupDto: { markupMode, markupValue?, markupMin?, markupMax? }`

- [ ] **Step 1: Write test file `backend/src/markup/markup.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MarkupService } from './markup.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('MarkupService', () => {
  let service: MarkupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      markupConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarkupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MarkupService>(MarkupService);
  });

  describe('computeMarkup', () => {
    it('should return fixedValue for FIXED mode', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue({
        mode: 'FIXED',
        fixedValue: 500,
        randomMin: 0,
        randomMax: 0,
      });

      const result = await service.computeMarkup();
      expect(result).toBe(500);
    });

    it('should return value in range for RANDOM mode', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue({
        mode: 'RANDOM',
        fixedValue: 0,
        randomMin: 100,
        randomMax: 500,
      });

      const result = await service.computeMarkup();
      expect(result).toBeGreaterThanOrEqual(100);
      expect(result).toBeLessThanOrEqual(500);
    });

    it('should return 0 if no config exists', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue(null);
      const result = await service.computeMarkup();
      expect(result).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should validate FIXED mode requires markupValue >= 0', async () => {
      prisma.markupConfig.upsert.mockResolvedValue({
        mode: 'FIXED',
        fixedValue: 200,
        randomMin: 0,
        randomMax: 0,
      });

      const result = await service.updateConfig({
        markupMode: 'FIXED',
        markupValue: 200,
      });
      expect(result.mode).toBe('FIXED');
    });

    it('should validate RANDOM mode requires markupMin <= markupMax', async () => {
      await expect(
        service.updateConfig({
          markupMode: 'RANDOM',
          markupMin: 500,
          markupMax: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate all values >= 0', async () => {
      await expect(
        service.updateConfig({
          markupMode: 'FIXED',
          markupValue: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create DTO**

`backend/src/markup/dto/update-markup.dto.ts`:

```typescript
import { IsEnum, IsInt, IsOptional } from 'class-validator';

enum MarkupModeDto {
  FIXED = 'FIXED',
  RANDOM = 'RANDOM',
}

export class UpdateMarkupDto {
  @IsEnum(MarkupModeDto)
  markupMode!: 'FIXED' | 'RANDOM';

  @IsOptional()
  @IsInt()
  markupValue?: number;

  @IsOptional()
  @IsInt()
  markupMin?: number;

  @IsOptional()
  @IsInt()
  markupMax?: number;
}
```

- [ ] **Step 4: Create `backend/src/markup/markup.service.ts`**

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMarkupDto } from './dto/update-markup.dto';

@Injectable()
export class MarkupService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.markupConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) {
      return {
        markupMode: 'FIXED' as const,
        markupValue: 0,
        markupMin: 0,
        markupMax: 0,
      };
    }
    return {
      markupMode: config.mode,
      markupValue: config.fixedValue,
      markupMin: config.randomMin,
      markupMax: config.randomMax,
    };
  }

  async updateConfig(dto: UpdateMarkupDto) {
    if (dto.markupMode === 'FIXED') {
      const val = dto.markupValue ?? 0;
      if (val < 0) throw new BadRequestException('markupValue must be >= 0');

      return this.prisma.markupConfig.upsert({
        where: { id: 'singleton' },
        update: { mode: 'FIXED', fixedValue: val },
        create: { id: 'singleton', mode: 'FIXED', fixedValue: val },
      });
    }

    const min = dto.markupMin ?? 0;
    const max = dto.markupMax ?? 0;
    if (min < 0 || max < 0) {
      throw new BadRequestException('markupMin and markupMax must be >= 0');
    }
    if (min > max) {
      throw new BadRequestException('markupMin must be <= markupMax');
    }

    return this.prisma.markupConfig.upsert({
      where: { id: 'singleton' },
      update: { mode: 'RANDOM', randomMin: min, randomMax: max },
      create: { id: 'singleton', mode: 'RANDOM', randomMin: min, randomMax: max },
    });
  }

  async computeMarkup(): Promise<number> {
    const config = await this.prisma.markupConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) return 0;

    if (config.mode === 'FIXED') {
      return config.fixedValue;
    }

    const range = config.randomMax - config.randomMin;
    return config.randomMin + Math.floor(Math.random() * (range + 1));
  }
}
```

- [ ] **Step 5: Create `backend/src/markup/markup.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { MarkupService } from './markup.service';

@Module({
  providers: [MarkupService],
  exports: [MarkupService],
})
export class MarkupModule {}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && npx jest src/markup/markup.service.spec.ts --verbose
```

Expected: 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/markup/
git commit -m "feat: add MarkupService with FIXED/RANDOM modes and validation"
```

---

### Task 3: BotConfig & Subscription Plan Services

**Files:**
- Create: `backend/src/botconfig/botconfig.service.ts`
- Create: `backend/src/botconfig/dto/update-botconfig.dto.ts`
- Create: `backend/src/botconfig/botconfig.module.ts`
- Create: `backend/src/subscription/subscription-plan.service.ts`
- Create: `backend/src/subscription/dto/update-plans.dto.ts`
- Create: `backend/src/subscription/subscription.module.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  - `BotConfigService.getConfig(): Promise<BotConfig>`
  - `BotConfigService.updateConfig(dto): Promise<BotConfig>`
  - `SubscriptionPlanService.getPlans(): Promise<SubscriptionPlan[]>`
  - `SubscriptionPlanService.updatePlans(dto): Promise<SubscriptionPlan[]>`

- [ ] **Step 1: Create `backend/src/botconfig/dto/update-botconfig.dto.ts`**

```typescript
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateBotConfigDto {
  @IsOptional()
  @IsString()
  welcomeText?: string;

  @IsOptional()
  @IsArray()
  categories?: string[];

  @IsOptional()
  @IsObject()
  featuresOn?: Record<string, boolean>;
}
```

- [ ] **Step 2: Create `backend/src/botconfig/botconfig.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBotConfigDto } from './dto/update-botconfig.dto';

@Injectable()
export class BotConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.botConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return {
      welcomeText: config.welcomeText,
      categories: JSON.parse(config.categories),
      featuresOn: JSON.parse(config.featuresOn),
    };
  }

  async updateConfig(dto: UpdateBotConfigDto) {
    const data: any = {};
    if (dto.welcomeText !== undefined) data.welcomeText = dto.welcomeText;
    if (dto.categories !== undefined) data.categories = JSON.stringify(dto.categories);
    if (dto.featuresOn !== undefined) data.featuresOn = JSON.stringify(dto.featuresOn);

    const config = await this.prisma.botConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    return {
      welcomeText: config.welcomeText,
      categories: JSON.parse(config.categories),
      featuresOn: JSON.parse(config.featuresOn),
    };
  }
}
```

- [ ] **Step 3: Create `backend/src/botconfig/botconfig.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BotConfigService } from './botconfig.service';

@Module({
  providers: [BotConfigService],
  exports: [BotConfigService],
})
export class BotConfigModule {}
```

- [ ] **Step 4: Create `backend/src/subscription/dto/update-plans.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class PlanItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(1)
  periodDays!: number;

  @IsBoolean()
  active!: boolean;
}

export class UpdatePlansDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  plans!: PlanItemDto[];
}
```

- [ ] **Step 5: Create `backend/src/subscription/subscription-plan.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlansDto } from './dto/update-plans.dto';

@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async updatePlans(dto: UpdatePlansDto) {
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const plan of dto.plans) {
        if (plan.id) {
          const updated = await tx.subscriptionPlan.update({
            where: { id: plan.id },
            data: {
              name: plan.name,
              price: plan.price,
              periodDays: plan.periodDays,
              active: plan.active,
            },
          });
          results.push(updated);
        } else {
          const created = await tx.subscriptionPlan.create({
            data: {
              name: plan.name,
              price: plan.price,
              periodDays: plan.periodDays,
              active: plan.active,
            },
          });
          results.push(created);
        }
      }
      return results;
    });
  }
}
```

- [ ] **Step 6: Create `backend/src/subscription/subscription.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  providers: [SubscriptionPlanService],
  exports: [SubscriptionPlanService],
})
export class SubscriptionModule {}
```

- [ ] **Step 7: Verify build**

```bash
cd backend && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/botconfig/ backend/src/subscription/
git commit -m "feat: add BotConfigService and SubscriptionPlanService"
```

---

### Task 4: Admin Stats Service

**Files:**
- Create: `backend/src/admin/admin-stats.service.ts`
- Create: `backend/src/admin/admin-stats.module.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  - `AdminStatsService.getStats(from?, to?): Promise<Stats>`
  - `AdminStatsService.getOrders(query): Promise<PaginatedOrders>`
  - `AdminStatsService.resendCredentials(orderId: string): Promise<void>` — placeholder (actual bot send in later fase)

- [ ] **Step 1: Create `backend/src/admin/admin-stats.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const where = from || to ? { createdAt: dateFilter } : {};

    const orders = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const orderStats = {
      total: orders.reduce((s, o) => s + o._count, 0),
      paid: orders.find((o) => o.status === 'PAID')?._count ?? 0,
      fulfilled: orders.find((o) => o.status === 'FULFILLED')?._count ?? 0,
      expired: orders.find((o) => o.status === 'EXPIRED')?._count ?? 0,
    };

    const sellerCredits = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'SELLER_CREDIT', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const operatorMarkup = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'OPERATOR_MARKUP', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const subFees = await this.prisma.ledgerEntry.aggregate({
      where: { type: 'SUBSCRIPTION_FEE', ...(from || to ? { createdAt: dateFilter } : {}) },
      _sum: { amount: true },
    });

    const revenue = {
      gross: (sellerCredits._sum.amount ?? 0) + (operatorMarkup._sum.amount ?? 0),
      operatorMarkup: operatorMarkup._sum.amount ?? 0,
      sellerCredit: sellerCredits._sum.amount ?? 0,
      subscriptionFees: subFees._sum.amount ?? 0,
    };

    return { orders: orderStats, revenue, topProducts: [] };
  }

  async getOrders(query: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          stockUnit: {
            select: { product: { select: { title: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        productTitle: o.stockUnit?.product?.title ?? 'Unknown',
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
```

- [ ] **Step 2: Create `backend/src/admin/admin-stats.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';

@Module({
  providers: [AdminStatsService],
  exports: [AdminStatsService],
})
export class AdminStatsModule {}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/admin/
git commit -m "feat: add AdminStatsService with stats and order management"
```

---

### Task 5: Admin Controller (REST API)

**Files:**
- Create: `backend/src/mobile/admin.controller.ts`
- Modify: `backend/src/mobile/mobile.module.ts`

**Interfaces:**
- Consumes: `AdminSellerService`, `MarkupService`, `BotConfigService`, `SubscriptionPlanService`, `AdminStatsService`
- Produces: All admin REST endpoints under `/api/admin/*`

- [ ] **Step 1: Create `backend/src/mobile/admin.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminSellerService } from '../seller/admin-seller.service';
import { MarkupService } from '../markup/markup.service';
import { BotConfigService } from '../botconfig/botconfig.service';
import { SubscriptionPlanService } from '../subscription/subscription-plan.service';
import { AdminStatsService } from '../admin/admin-stats.service';
import { UpdateMarkupDto } from '../markup/dto/update-markup.dto';
import { UpdateBotConfigDto } from '../botconfig/dto/update-botconfig.dto';
import { UpdatePlansDto } from '../subscription/dto/update-plans.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminSellerService: AdminSellerService,
    private readonly markupService: MarkupService,
    private readonly botConfigService: BotConfigService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly adminStatsService: AdminStatsService,
  ) {}

  @Get('sellers')
  listSellers(@Query('status') status?: string) {
    return this.adminSellerService.listSellers(status);
  }

  @Get('sellers/:id')
  getSellerDetail(@Param('id') id: string) {
    return this.adminSellerService.getSellerDetail(id);
  }

  @Post('sellers/:id/approve')
  approveSeller(@Param('id') id: string) {
    return this.adminSellerService.approveSeller(id);
  }

  @Post('sellers/:id/verify-profile')
  verifyProfile(@Param('id') id: string) {
    return this.adminSellerService.verifyProfile(id);
  }

  @Post('sellers/:id/reject')
  rejectSeller(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminSellerService.rejectSeller(id, reason);
  }

  @Post('sellers/:id/suspend')
  suspendSeller(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminSellerService.suspendSeller(id, reason);
  }

  @Get('markup')
  getMarkup() {
    return this.markupService.getConfig();
  }

  @Put('markup')
  updateMarkup(@Body() dto: UpdateMarkupDto) {
    return this.markupService.updateConfig(dto);
  }

  @Get('subscription-plans')
  getSubscriptionPlans() {
    return this.subscriptionPlanService.getPlans();
  }

  @Put('subscription-plans')
  updateSubscriptionPlans(@Body() dto: UpdatePlansDto) {
    return this.subscriptionPlanService.updatePlans(dto);
  }

  @Get('botconfig')
  getBotConfig() {
    return this.botConfigService.getConfig();
  }

  @Put('botconfig')
  updateBotConfig(@Body() dto: UpdateBotConfigDto) {
    return this.botConfigService.updateConfig(dto);
  }

  @Get('stats')
  getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminStatsService.getStats(from, to);
  }

  @Get('orders')
  getOrders(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminStatsService.getOrders({
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
```

- [ ] **Step 2: Update `backend/src/mobile/mobile.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { AdminController } from './admin.controller';
import { SellerModule } from '../seller/seller.module';
import { CatalogModule } from '../catalog/catalog.module';
import { StockModule } from '../stock/stock.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MarkupModule } from '../markup/markup.module';
import { BotConfigModule } from '../botconfig/botconfig.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AdminStatsModule } from '../admin/admin-stats.module';

@Module({
  imports: [
    SellerModule,
    CatalogModule,
    StockModule,
    LedgerModule,
    MarkupModule,
    BotConfigModule,
    SubscriptionModule,
    AdminStatsModule,
  ],
  controllers: [SellerController, AdminController],
})
export class MobileModule {}
```

- [ ] **Step 3: Verify build and all tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/mobile/ 
git commit -m "feat: add admin REST controller with all management endpoints"
```
