# Fase 2: Seller Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the seller domain: products CRUD, encrypted stock management (write-only), seller lifecycle (PENDING→APPROVED→PROFILE_SUBMITTED→ACTIVE), and encrypted payout profile. All accessible via REST API for the mobile app.

**Architecture:** Seller controllers behind JwtAuthGuard + RolesGuard(SELLER). Stock credentials encrypted via CryptoService (AES-256-GCM). Seller status gates product/stock operations — only ACTIVE sellers can manage products and stock. SellerProfile stores encrypted payout account info.

**Tech Stack:** NestJS, Prisma, CryptoService (from Fase 0), JwtAuthGuard + RolesGuard (from Fase 1), class-validator DTOs

## Global Constraints

- TypeScript strict mode enabled (`strict: true` in tsconfig)
- Credentials (stock credentials, payout accounts) encrypted with AES-256-GCM via CryptoService, never logged, never returned to mobile
- Stock credentials are WRITE-ONLY from seller perspective — GET stock never returns credential fields
- Payout account is WRITE-ONLY from seller perspective — only admin can view (audited, Fase 3)
- Only sellers with status ACTIVE can create products and add stock
- All amounts in rupiah (integer, never float)
- All endpoints require JWT + role SELLER
- cuid() for all primary keys
- Webhook path `/v1.0/debit/notify` must NOT be affected by any global API prefix

---

### Task 1: Seller Status & Profile Service

**Files:**
- Create: `backend/src/seller/seller.service.ts`
- Create: `backend/src/seller/seller.service.spec.ts`
- Create: `backend/src/seller/dto/submit-profile.dto.ts`
- Create: `backend/src/seller/seller.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`
- Produces:
  - `SellerService.getStatus(userId: string): Promise<{ id, name, status, email, storeCode? }>`
  - `SellerService.submitProfile(userId: string, dto: SubmitProfileDto): Promise<{ status }>`
  - `SubmitProfileDto: { payoutAccount: string }`

- [ ] **Step 1: Write test file `backend/src/seller/seller.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SellerService } from './seller.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SellerService', () => {
  let service: SellerService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      seller: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sellerProfile: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    crypto = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'enc-payout',
        iv: 'iv-123',
        authTag: 'tag-456',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<SellerService>(SellerService);
  });

  describe('getStatus', () => {
    it('should return seller status for a valid user', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        name: 'Test Seller',
        status: 'PENDING',
        storeCode: null,
        user: { email: 'test@test.com' },
      });

      const result = await service.getStatus('user-1');
      expect(result).toEqual({
        id: 'seller-1',
        name: 'Test Seller',
        status: 'PENDING',
        email: 'test@test.com',
        storeCode: null,
      });
    });

    it('should throw NotFoundException if no seller for user', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('no-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitProfile', () => {
    it('should encrypt payout and create profile when status is APPROVED', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: 'APPROVED',
        profile: null,
      });
      prisma.sellerProfile.create.mockResolvedValue({});
      prisma.seller.update.mockResolvedValue({ status: 'PROFILE_SUBMITTED' });

      const result = await service.submitProfile('user-1', {
        payoutAccount: 'BCA 1234567890',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('BCA 1234567890');
      expect(prisma.sellerProfile.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-1',
          encPayout: 'enc-payout',
          payoutIv: 'iv-123',
          payoutTag: 'tag-456',
        },
      });
      expect(result.status).toBe('PROFILE_SUBMITTED');
    });

    it('should throw BadRequestException if status is not APPROVED', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: 'PENDING',
      });

      await expect(
        service.submitProfile('user-1', { payoutAccount: 'BCA 123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if no seller', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);

      await expect(
        service.submitProfile('no-user', { payoutAccount: 'BCA 123' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/seller/seller.service.spec.ts --verbose
```

Expected: FAIL — SellerService not found.

- [ ] **Step 3: Create `backend/src/seller/dto/submit-profile.dto.ts`**

```typescript
import { IsString, MinLength } from 'class-validator';

export class SubmitProfileDto {
  @IsString()
  @MinLength(1)
  payoutAccount!: string;
}
```

- [ ] **Step 4: Create `backend/src/seller/seller.service.ts`**

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SubmitProfileDto } from './dto/submit-profile.dto';

@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getStatus(userId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }
    return {
      id: seller.id,
      name: seller.name,
      status: seller.status,
      email: seller.user.email,
      storeCode: seller.storeCode,
    };
  }

  async submitProfile(userId: string, dto: SubmitProfileDto) {
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      include: { profile: true },
    });
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }
    if (seller.status !== 'APPROVED') {
      throw new BadRequestException(
        'Profile can only be submitted when status is APPROVED',
      );
    }

    const encrypted = this.crypto.encrypt(dto.payoutAccount);

    return this.prisma.$transaction(async (tx) => {
      await tx.sellerProfile.create({
        data: {
          sellerId: seller.id,
          encPayout: encrypted.ciphertext,
          payoutIv: encrypted.iv,
          payoutTag: encrypted.authTag,
        },
      });

      const updated = await tx.seller.update({
        where: { id: seller.id },
        data: { status: 'PROFILE_SUBMITTED' },
      });

      return { status: updated.status };
    });
  }
}
```

- [ ] **Step 5: Create `backend/src/seller/seller.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SellerService } from './seller.service';

@Module({
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && npx jest src/seller/seller.service.spec.ts --verbose
```

Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/seller/
git commit -m "feat: add SellerService with status check and profile submission"
```

---

### Task 2: Product Service (CRUD)

**Files:**
- Create: `backend/src/catalog/catalog.service.ts`
- Create: `backend/src/catalog/catalog.service.spec.ts`
- Create: `backend/src/catalog/dto/create-product.dto.ts`
- Create: `backend/src/catalog/dto/update-product.dto.ts`
- Create: `backend/src/catalog/catalog.module.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  - `CatalogService.listProducts(sellerId: string): Promise<Product[]>` — includes stock counts
  - `CatalogService.createProduct(sellerId: string, dto: CreateProductDto): Promise<Product>`
  - `CatalogService.updateProduct(sellerId: string, productId: string, dto: UpdateProductDto): Promise<Product>`
  - `CreateProductDto: { category: string, title: string, basePrice: number }`
  - `UpdateProductDto: { title?: string, basePrice?: number, active?: boolean }`

- [ ] **Step 1: Write test file `backend/src/catalog/catalog.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockUnit: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('listProducts', () => {
    it('should return products with stock counts', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          category: 'streaming',
          title: 'Netflix',
          basePrice: 50000,
          active: true,
          stockType: 'PRE_STOCKED',
          _count: undefined,
          stockUnits: [
            { status: 'AVAILABLE' },
            { status: 'AVAILABLE' },
            { status: 'SOLD' },
          ],
        },
      ]);

      const result = await service.listProducts('seller-1');
      expect(result[0].stockCount).toEqual({
        available: 2,
        locked: 0,
        sold: 1,
      });
    });
  });

  describe('createProduct', () => {
    it('should create a product', async () => {
      prisma.product.create.mockResolvedValue({
        id: 'prod-1',
        category: 'streaming',
        title: 'Netflix',
        basePrice: 50000,
        active: true,
      });

      const result = await service.createProduct('seller-1', {
        category: 'streaming',
        title: 'Netflix',
        basePrice: 50000,
      });

      expect(result.id).toBe('prod-1');
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-1',
          category: 'streaming',
          title: 'Netflix',
          basePrice: 50000,
        },
      });
    });
  });

  describe('updateProduct', () => {
    it('should update product belonging to seller', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', sellerId: 'seller-1' });
      prisma.product.update.mockResolvedValue({
        id: 'prod-1',
        title: 'Netflix Premium',
        basePrice: 60000,
        active: true,
      });

      const result = await service.updateProduct('seller-1', 'prod-1', {
        title: 'Netflix Premium',
        basePrice: 60000,
      });

      expect(result.title).toBe('Netflix Premium');
    });

    it('should throw NotFoundException if product not found or not owned', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProduct('seller-1', 'prod-x', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/catalog/catalog.service.spec.ts --verbose
```

- [ ] **Step 3: Create DTOs**

`backend/src/catalog/dto/create-product.dto.ts`:

```typescript
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsInt()
  @Min(0)
  basePrice!: number;
}
```

`backend/src/catalog/dto/update-product.dto.ts`:

```typescript
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 4: Create `backend/src/catalog/catalog.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(sellerId: string) {
    const products = await this.prisma.product.findMany({
      where: { sellerId },
      include: { stockUnits: { select: { status: true } } },
    });

    return products.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      basePrice: p.basePrice,
      active: p.active,
      stockType: p.stockType,
      stockCount: {
        available: p.stockUnits.filter((s) => s.status === 'AVAILABLE').length,
        locked: p.stockUnits.filter((s) => s.status === 'LOCKED').length,
        sold: p.stockUnits.filter((s) => s.status === 'SOLD').length,
      },
    }));
  }

  async createProduct(sellerId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        sellerId,
        category: dto.category,
        title: dto.title,
        basePrice: dto.basePrice,
      },
    });
  }

  async updateProduct(sellerId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
    });
  }
}
```

- [ ] **Step 5: Create `backend/src/catalog/catalog.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Module({
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && npx jest src/catalog/catalog.service.spec.ts --verbose
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/catalog/
git commit -m "feat: add CatalogService with products CRUD"
```

---

### Task 3: Stock Service (Encrypted, Write-Only)

**Files:**
- Create: `backend/src/stock/stock.service.ts`
- Create: `backend/src/stock/stock.service.spec.ts`
- Create: `backend/src/stock/dto/add-stock.dto.ts`
- Create: `backend/src/stock/stock.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`, `CatalogService` (for ownership check)
- Produces:
  - `StockService.addStock(sellerId: string, productId: string, dto: AddStockDto): Promise<{ stockUnitId, status }>`
  - `StockService.listStock(sellerId: string, query: { productId?, status? }): Promise<StockUnit[]>` — NEVER returns credentials
  - `AddStockDto: { credentials: string }`

- [ ] **Step 1: Write test file `backend/src/stock/stock.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { NotFoundException } from '@nestjs/common';

describe('StockService', () => {
  let service: StockService;
  let prisma: any;
  let crypto: any;

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      stockUnit: { create: jest.fn(), findMany: jest.fn() },
    };

    crypto = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'encrypted-cred',
        iv: 'iv-abc',
        authTag: 'tag-def',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  describe('addStock', () => {
    it('should encrypt credentials and create stock unit', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', sellerId: 'seller-1' });
      prisma.stockUnit.create.mockResolvedValue({
        id: 'stock-1',
        status: 'AVAILABLE',
      });

      const result = await service.addStock('seller-1', 'prod-1', {
        credentials: 'user@example.com:password123',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('user@example.com:password123');
      expect(prisma.stockUnit.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          encCredentials: 'encrypted-cred',
          iv: 'iv-abc',
          authTag: 'tag-def',
          status: 'AVAILABLE',
        },
      });
      expect(result).toEqual({ stockUnitId: 'stock-1', status: 'AVAILABLE' });
    });

    it('should throw NotFoundException if product not owned by seller', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.addStock('seller-1', 'prod-x', { credentials: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listStock', () => {
    it('should return stock units WITHOUT credential fields', async () => {
      prisma.stockUnit.findMany.mockResolvedValue([
        {
          id: 'stock-1',
          productId: 'prod-1',
          status: 'AVAILABLE',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listStock('seller-1', {});

      expect(result[0]).toEqual({
        id: 'stock-1',
        productId: 'prod-1',
        status: 'AVAILABLE',
        createdAt: expect.any(Date),
      });
      expect(result[0]).not.toHaveProperty('encCredentials');
      expect(result[0]).not.toHaveProperty('iv');
      expect(result[0]).not.toHaveProperty('authTag');
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest src/stock/stock.service.spec.ts --verbose
```

- [ ] **Step 3: Create DTO**

`backend/src/stock/dto/add-stock.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class AddStockDto {
  @IsString()
  @MinLength(1)
  credentials!: string;
}
```

- [ ] **Step 4: Create `backend/src/stock/stock.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AddStockDto } from './dto/add-stock.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async addStock(sellerId: string, productId: string, dto: AddStockDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const encrypted = this.crypto.encrypt(dto.credentials);

    const unit = await this.prisma.stockUnit.create({
      data: {
        productId,
        encCredentials: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        status: 'AVAILABLE',
      },
    });

    return { stockUnitId: unit.id, status: unit.status };
  }

  async listStock(sellerId: string, query: { productId?: string; status?: string }) {
    const where: any = {
      product: { sellerId },
    };
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;

    const units = await this.prisma.stockUnit.findMany({
      where,
      select: {
        id: true,
        productId: true,
        status: true,
        createdAt: true,
      },
    });

    return units;
  }
}
```

- [ ] **Step 5: Create `backend/src/stock/stock.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StockService } from './stock.service';

@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && npx jest src/stock/stock.service.spec.ts --verbose
```

Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/stock/
git commit -m "feat: add StockService with encrypted write-only stock"
```

---

### Task 4: Seller Controller (REST API)

**Files:**
- Create: `backend/src/mobile/seller.controller.ts`
- Create: `backend/src/mobile/mobile.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SellerService`, `CatalogService`, `StockService`, `JwtAuthGuard`, `RolesGuard`, `@Roles`
- Produces: REST endpoints:
  - `GET  /api/seller/me` — seller info
  - `GET  /api/seller/status` — status + next step
  - `POST /api/seller/profile` — submit payout (guard: APPROVED)
  - `GET  /api/seller/products` — list with stock counts
  - `POST /api/seller/products` — create (guard: ACTIVE)
  - `PATCH /api/seller/products/:id` — update
  - `POST /api/seller/products/:id/stock` — add stock, write-only (guard: ACTIVE)
  - `GET  /api/seller/stock` — list without credentials

- [ ] **Step 1: Create ActiveSellerGuard**

`backend/src/seller/guards/active-seller.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActiveSellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.sub;

    const seller = await this.prisma.seller.findUnique({
      where: { userId },
    });

    if (!seller || seller.status !== 'ACTIVE') {
      throw new ForbiddenException('Seller must be ACTIVE to perform this action');
    }

    request.seller = seller;
    return true;
  }
}
```

- [ ] **Step 2: Create `backend/src/mobile/seller.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveSellerGuard } from '../seller/guards/active-seller.guard';
import { SellerService } from '../seller/seller.service';
import { CatalogService } from '../catalog/catalog.service';
import { StockService } from '../stock/stock.service';
import { SubmitProfileDto } from '../seller/dto/submit-profile.dto';
import { CreateProductDto } from '../catalog/dto/create-product.dto';
import { UpdateProductDto } from '../catalog/dto/update-product.dto';
import { AddStockDto } from '../stock/dto/add-stock.dto';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SELLER)
export class SellerController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly catalogService: CatalogService,
    private readonly stockService: StockService,
  ) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Get('status')
  getStatus(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Post('profile')
  submitProfile(@Req() req: any, @Body() dto: SubmitProfileDto) {
    return this.sellerService.submitProfile(req.user.sub, dto);
  }

  @Get('products')
  async listProducts(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.listProducts(seller.id);
  }

  @Post('products')
  @UseGuards(ActiveSellerGuard)
  async createProduct(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(req.seller.id, dto);
  }

  @Patch('products/:id')
  async updateProduct(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.updateProduct(seller.id, id, dto);
  }

  @Post('products/:id/stock')
  @UseGuards(ActiveSellerGuard)
  addStock(@Req() req: any, @Param('id') id: string, @Body() dto: AddStockDto) {
    return this.stockService.addStock(req.seller.id, id, dto);
  }

  @Get('stock')
  async listStock(
    @Req() req: any,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
  ) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.stockService.listStock(seller.id, { productId, status });
  }
}
```

- [ ] **Step 3: Create `backend/src/mobile/mobile.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { SellerModule } from '../seller/seller.module';
import { CatalogModule } from '../catalog/catalog.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [SellerModule, CatalogModule, StockModule],
  controllers: [SellerController],
})
export class MobileModule {}
```

- [ ] **Step 4: Update AppModule**

Add MobileModule to imports in `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { MobileModule } from './mobile/mobile.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    QueueModule,
    CryptoModule,
    AuthModule,
    MobileModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Verify build**

```bash
cd backend && npm run build
```

- [ ] **Step 6: Run all tests**

```bash
cd backend && npx jest --verbose
```

Expected: all existing tests still pass (14 unit + new seller/catalog/stock tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/mobile/ backend/src/seller/guards/ backend/src/app.module.ts
git commit -m "feat: add seller REST controller with product, stock, and profile endpoints"
```

---

### Task 5: Seller Balance & Sales Endpoints

**Files:**
- Create: `backend/src/ledger/ledger.service.ts`
- Create: `backend/src/ledger/ledger.module.ts`
- Modify: `backend/src/mobile/seller.controller.ts`
- Modify: `backend/src/mobile/mobile.module.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  - `LedgerService.getBalance(sellerId: string): Promise<{ available, currency, entries }>`
  - `LedgerService.getSales(sellerId: string): Promise<SaleItem[]>`
  - `GET /api/seller/balance`
  - `GET /api/seller/sales`

- [ ] **Step 1: Create `backend/src/ledger/ledger.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(sellerId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { sellerId, type: 'SELLER_CREDIT' },
      orderBy: { createdAt: 'desc' },
    });

    const available = entries.reduce((sum, e) => sum + e.amount, 0);

    return {
      available,
      currency: 'IDR' as const,
      entries: entries.map((e) => ({
        orderId: e.orderId,
        amount: e.amount,
        createdAt: e.createdAt,
      })),
    };
  }

  async getSales(sellerId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { sellerId, type: 'SELLER_CREDIT' },
      include: {
        order: {
          select: { fulfilledAt: true },
          include: {
            stockUnit: {
              select: {
                product: { select: { title: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map((e) => ({
      orderId: e.orderId,
      productTitle: e.order?.stockUnit?.product?.title ?? 'Unknown',
      amount: e.amount,
      soldAt: e.order?.fulfilledAt ?? e.createdAt,
    }));
  }
}
```

- [ ] **Step 2: Create `backend/src/ledger/ledger.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
```

- [ ] **Step 3: Add balance and sales endpoints to seller.controller.ts**

Add to the SellerController:

```typescript
// Add import
import { LedgerService } from '../ledger/ledger.service';

// Add to constructor
private readonly ledgerService: LedgerService,

// Add endpoints
@Get('balance')
async getBalance(@Req() req: any) {
  const seller = await this.sellerService.getStatus(req.user.sub);
  return this.ledgerService.getBalance(seller.id);
}

@Get('sales')
async getSales(@Req() req: any) {
  const seller = await this.sellerService.getStatus(req.user.sub);
  return this.ledgerService.getSales(seller.id);
}
```

- [ ] **Step 4: Update MobileModule to import LedgerModule**

- [ ] **Step 5: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/ledger/ backend/src/mobile/
git commit -m "feat: add seller balance and sales endpoints"
```

---

### Task 6: Seller Store Link Endpoint

**Files:**
- Modify: `backend/src/mobile/seller.controller.ts`
- Modify: `backend/src/seller/seller.service.ts`

**Interfaces:**
- Consumes: `ConfigService` (TELEGRAM_BOT_USERNAME), `SellerService`
- Produces:
  - `GET /api/seller/store-link` — returns `{ storeCode, url }`

- [ ] **Step 1: Add getStoreLink to SellerService**

```typescript
// In seller.service.ts, add ConfigService to constructor and import
import { ConfigService } from '@nestjs/config';

// Constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly crypto: CryptoService,
  private readonly config: ConfigService,
) {}

// Method:
async getStoreLink(userId: string) {
  const seller = await this.prisma.seller.findUnique({
    where: { userId },
  });
  if (!seller) {
    throw new NotFoundException('Seller not found');
  }
  if (!seller.storeCode) {
    throw new BadRequestException('Store code not yet assigned');
  }

  const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
  return {
    storeCode: seller.storeCode,
    url: `https://t.me/${botUsername}?start=${seller.storeCode}`,
  };
}
```

- [ ] **Step 2: Add endpoint to SellerController**

```typescript
@Get('store-link')
getStoreLink(@Req() req: any) {
  return this.sellerService.getStoreLink(req.user.sub);
}
```

- [ ] **Step 3: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/seller/ backend/src/mobile/
git commit -m "feat: add seller store-link endpoint"
```
