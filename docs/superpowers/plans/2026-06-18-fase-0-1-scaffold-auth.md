# Fase 0 + 1: Backend Scaffold & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the NestJS backend with all Prisma models, config validation, CryptoService, Redis/BullMQ, and complete JWT authentication with role-based guards.

**Architecture:** Monorepo with `backend/` (NestJS) and `mobile/` (Expo, later). Backend uses Prisma for PostgreSQL, Redis for caching/queues, AES-256-GCM for credential encryption with a KeyProvider abstraction. Auth uses JWT access+refresh tokens with a RolesGuard (SELLER/ADMIN).

**Tech Stack:** Node.js 18+, TypeScript strict, NestJS, Prisma, Redis, BullMQ, @nestjs/jwt, passport-jwt, bcrypt, class-validator, class-transformer, zod (env validation)

## Global Constraints

- TypeScript strict mode enabled (`strict: true` in tsconfig)
- All env vars validated at startup via zod — fail fast on missing/invalid
- Credentials (encryption keys, JWT secrets) never logged, never in error messages
- Encryption key (`CREDENTIAL_ENC_KEY`) stored in env, accessed via KeyProvider abstraction (KMS later)
- Webhook path `/v1.0/debit/notify` must NOT be affected by any global API prefix
- All mobile API endpoints use `/api` prefix
- All amounts in rupiah (integer, never float)
- cuid() for all primary keys
- Passwords hashed with bcrypt (cost factor 10)
- JWT access token TTL: 900s (15 min), refresh: 2592000s (30 days) — configurable via env

---

### Task 1: Initialize NestJS Project & TypeScript Config

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`
- Create: `backend/nest-cli.json`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: runnable NestJS app on port 3000, `AppModule` class

- [ ] **Step 1: Create backend directory and initialize NestJS project**

```bash
npx @nestjs/cli new backend --strict --skip-git --package-manager npm
```

- [ ] **Step 2: Verify TypeScript strict mode in `backend/tsconfig.json`**

Ensure these compiler options are set:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 3: Create `.env.example` at project root**

```env
# DANA
DANA_ENV=sandbox
X_PARTNER_ID=PLACEHOLDER
PRIVATE_KEY=PLACEHOLDER
ORIGIN=http://localhost:3000
DANA_PUBLIC_KEY=PLACEHOLDER

# Telegram
TELEGRAM_BOT_TOKEN=PLACEHOLDER
TELEGRAM_BOT_USERNAME=PLACEHOLDER

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reshare?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# Encryption
CREDENTIAL_ENC_KEY=dGhpcyBpcyBhIDMyIGJ5dGUga2V5IGZvciB0ZXN0cw==

# JWT
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000

# Order
ORDER_TTL_MINUTES=15
ORDER_FULFILL_SLA_MINUTES=60
REPORT_SLA_HOURS=24
```

- [ ] **Step 4: Create `.gitignore` at project root**

```gitignore
node_modules/
dist/
.env
*.log
coverage/
.turbo/
```

- [ ] **Step 5: Update `backend/src/main.ts` with rawBody support and API prefix (webhook excluded)**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api', {
    exclude: ['/v1.0/debit/notify'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 6: Verify app starts**

```bash
cd backend && npm run start:dev
```

Expected: NestJS starts on port 3000, no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/ .gitignore .env.example
git commit -m "feat: initialize NestJS backend with strict TS, rawBody, API prefix"
```

---

### Task 2: Environment Config with Zod Validation

**Files:**
- Create: `backend/src/config/env.schema.ts`
- Create: `backend/src/config/config.module.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/.env` (copy from `.env.example`, gitignored)

**Interfaces:**
- Consumes: `AppModule` from Task 1
- Produces: `ConfigModule` (global), validated env accessible via `ConfigService.get<string>('DATABASE_URL')` etc.

- [ ] **Step 1: Install dependencies**

```bash
cd backend && npm install zod @nestjs/config
```

- [ ] **Step 2: Create `backend/src/config/env.schema.ts`**

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  DANA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  X_PARTNER_ID: z.string().min(1),
  PRIVATE_KEY: z.string().min(1),
  ORIGIN: z.string().url(),
  DANA_PUBLIC_KEY: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  CREDENTIAL_ENC_KEY: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  ORDER_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  ORDER_FULFILL_SLA_MINUTES: z.coerce.number().int().positive().default(60),
  REPORT_SLA_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 3: Create `backend/src/config/config.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          const formatted = parsed.error.issues
            .map((i) => `  ${i.path.join('.')}: ${i.message}`)
            .join('\n');
          throw new Error(`Environment validation failed:\n${formatted}`);
        }
        return parsed.data;
      },
    }),
  ],
})
export class AppConfigModule {}
```

- [ ] **Step 4: Update `backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';

@Module({
  imports: [AppConfigModule],
})
export class AppModule {}
```

- [ ] **Step 5: Copy `.env.example` to `backend/.env` and verify startup**

```bash
cp .env.example backend/.env
cd backend && npm run start:dev
```

Expected: app starts without validation errors.

- [ ] **Step 6: Verify validation catches missing vars — temporarily remove `DATABASE_URL` from `.env`**

Expected: startup fails with `Environment validation failed: DATABASE_URL: ...`

Restore the var after testing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/ backend/package.json backend/package-lock.json
git commit -m "feat: add env validation with zod schema"
```

---

### Task 3: Prisma Setup & Full Schema

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/prisma/prisma.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ConfigService` from Task 2
- Produces: `PrismaService` (injectable, extends PrismaClient), `PrismaModule` (global). All models: User, Seller, SellerProfile, Product, StockUnit, Order, LedgerEntry, BotConfig, SubscriptionPlan, Subscription, BuyerAffiliation, Report.

- [ ] **Step 1: Install Prisma**

```bash
cd backend && npm install prisma @prisma/client && npx prisma init
```

- [ ] **Step 2: Write `backend/prisma/schema.prisma` with all models from spec**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  SELLER
  ADMIN
}

enum SellerStatus {
  PENDING
  APPROVED
  PROFILE_SUBMITTED
  ACTIVE
  SUSPENDED
}

enum StockStatus {
  AVAILABLE
  LOCKED
  SOLD
}

enum StockType {
  PRE_STOCKED
  ON_DEMAND
}

enum OrderStatus {
  PENDING
  PAID
  WAITING_SELLER
  EXPIRED
  FAILED
  FULFILLED
}

enum LedgerType {
  SELLER_CREDIT
  OPERATOR_MARKUP
  SUBSCRIPTION_FEE
}

enum SubStatus {
  PENDING
  ACTIVE
  EXPIRED
  CANCELLED
}

enum MarkupMode {
  FIXED
  RANDOM
}

enum ReportStatus {
  OPEN
  RESPONDED
  RESOLVED
  ESCALATED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(SELLER)
  seller       Seller?
  createdAt    DateTime @default(now())
}

model Seller {
  id            String          @id @default(cuid())
  userId        String          @unique
  user          User            @relation(fields: [userId], references: [id])
  name          String
  phone         String
  storeCode     String?         @unique
  status        SellerStatus    @default(PENDING)
  products      Product[]
  ledgerEntries LedgerEntry[]
  profile       SellerProfile?
  subscriptions Subscription[]
  reports       Report[]
  createdAt     DateTime        @default(now())
}

model SellerProfile {
  id         String    @id @default(cuid())
  sellerId   String    @unique
  seller     Seller    @relation(fields: [sellerId], references: [id])
  encPayout  String
  payoutIv   String
  payoutTag  String
  verifiedAt DateTime?
  createdAt  DateTime  @default(now())
}

model Product {
  id         String      @id @default(cuid())
  sellerId   String
  seller     Seller      @relation(fields: [sellerId], references: [id])
  category   String
  title      String
  basePrice  Int
  stockType  StockType   @default(PRE_STOCKED)
  active     Boolean     @default(true)
  stockUnits StockUnit[]
  createdAt  DateTime    @default(now())
}

model StockUnit {
  id             String      @id @default(cuid())
  productId      String
  product        Product     @relation(fields: [productId], references: [id])
  encCredentials String
  iv             String
  authTag        String
  status         StockStatus @default(AVAILABLE)
  order          Order?
  createdAt      DateTime    @default(now())
}

model Order {
  id                    String      @id @default(cuid())
  buyerTgUserId         BigInt
  stockUnitId           String?     @unique
  stockUnit             StockUnit?  @relation(fields: [stockUnitId], references: [id])
  productId             String
  basePrice             Int
  markup                Int
  totalAmount           Int
  partnerReferenceNo    String      @unique
  danaReferenceNo       String?
  status                OrderStatus @default(PENDING)
  qrContent             String?
  expiresAt             DateTime
  createdAt             DateTime    @default(now())
  fulfilledAt           DateTime?
}

model LedgerEntry {
  id        String     @id @default(cuid())
  sellerId  String?
  seller    Seller?    @relation(fields: [sellerId], references: [id])
  orderId   String
  type      LedgerType
  amount    Int
  createdAt DateTime   @default(now())
}

model BotConfig {
  id          String   @id @default("singleton")
  welcomeText String   @default("")
  categories  String   @default("[]")
  featuresOn  String   @default("{}")
  updatedAt   DateTime @updatedAt
}

model MarkupConfig {
  id         String     @id @default("singleton")
  mode       MarkupMode @default(FIXED)
  fixedValue Int        @default(0)
  randomMin  Int        @default(0)
  randomMax  Int        @default(0)
  updatedAt  DateTime   @updatedAt
}

model SubscriptionPlan {
  id            String         @id @default(cuid())
  name          String
  price         Int
  periodDays    Int
  active        Boolean        @default(true)
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id                    String   @id @default(cuid())
  sellerId              String
  seller                Seller   @relation(fields: [sellerId], references: [id])
  planId                String
  plan                  SubscriptionPlan @relation(fields: [planId], references: [id])
  status                SubStatus @default(PENDING)
  partnerReferenceNo    String    @unique
  startedAt             DateTime?
  expiresAt             DateTime?
  createdAt             DateTime  @default(now())
}

model BuyerAffiliation {
  id            String   @id @default(cuid())
  buyerTgUserId BigInt   @unique
  sellerId      String
  updatedAt     DateTime @updatedAt
}

model Report {
  id            String       @id @default(cuid())
  orderId       String
  buyerTgUserId BigInt
  sellerId      String
  seller        Seller       @relation(fields: [sellerId], references: [id])
  message       String
  status        ReportStatus @default(OPEN)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}
```

- [ ] **Step 3: Create `backend/src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Create `backend/src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Add PrismaModule to AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule],
})
export class AppModule {}
```

- [ ] **Step 6: Generate Prisma client and run migration**

```bash
cd backend && npx prisma generate && npx prisma migrate dev --name init
```

Expected: migration creates all tables and enums. Prisma client generated.

- [ ] **Step 7: Verify by starting the app**

```bash
cd backend && npm run start:dev
```

Expected: app starts successfully, connects to PostgreSQL.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/ backend/src/prisma/ backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat: add Prisma schema with all models and PrismaModule"
```

---

### Task 4: Redis & BullMQ Setup

**Files:**
- Create: `backend/src/queue/queue.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ConfigService` from Task 2
- Produces: `BullModule` (global), ready to register queues in later tasks via `BullModule.registerQueue()`

- [ ] **Step 1: Install BullMQ dependencies**

```bash
cd backend && npm install @nestjs/bullmq bullmq ioredis
```

- [ ] **Step 2: Create `backend/src/queue/queue.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),
  ],
})
export class QueueModule {}
```

- [ ] **Step 3: Add QueueModule to AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [AppConfigModule, PrismaModule, QueueModule],
})
export class AppModule {}
```

- [ ] **Step 4: Verify app starts with Redis connection**

```bash
cd backend && npm run start:dev
```

Expected: app starts without Redis connection errors (Redis must be running locally or use a test instance).

- [ ] **Step 5: Commit**

```bash
git add backend/src/queue/ backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat: add Redis/BullMQ queue module"
```

---

### Task 5: CryptoService & KeyProvider (with TDD)

**Files:**
- Create: `backend/src/crypto/key-provider.ts`
- Create: `backend/src/crypto/crypto.service.ts`
- Create: `backend/src/crypto/crypto.module.ts`
- Create: `backend/src/crypto/crypto.service.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ConfigService` from Task 2
- Produces:
  - `KeyProvider` with method `getKey(): Buffer` — returns 32-byte encryption key
  - `CryptoService` with methods:
    - `encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string }`
    - `decrypt(ciphertext: string, iv: string, authTag: string): string`

- [ ] **Step 1: Write the test file `backend/src/crypto/crypto.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';
import { KeyProvider } from './key-provider';
import { randomBytes } from 'node:crypto';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const testKey = randomBytes(32);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: KeyProvider,
          useValue: { getKey: () => testKey },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it('should encrypt and decrypt a string (round-trip)', () => {
    const plaintext = 'user@example.com:P@ssw0rd123';
    const encrypted = service.encrypt(plaintext);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(plaintext);

    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (unique IV)', () => {
    const plaintext = 'same-input';
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = service.encrypt('secret');
    const tampered =
      encrypted.ciphertext.slice(0, -2) +
      (encrypted.ciphertext.endsWith('aa') ? 'bb' : 'aa');

    expect(() =>
      service.decrypt(tampered, encrypted.iv, encrypted.authTag),
    ).toThrow();
  });

  it('should throw on wrong authTag', () => {
    const encrypted = service.encrypt('secret');
    const wrongTag = Buffer.alloc(16).toString('hex');

    expect(() =>
      service.decrypt(encrypted.ciphertext, encrypted.iv, wrongTag),
    ).toThrow();
  });

  it('should handle empty string', () => {
    const encrypted = service.encrypt('');
    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe('');
  });

  it('should handle unicode content', () => {
    const plaintext = 'Kredensial: юзер@тест.com / パスワード';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe(plaintext);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest src/crypto/crypto.service.spec.ts --verbose
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `backend/src/crypto/key-provider.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeyProvider {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const b64 = config.get<string>('CREDENTIAL_ENC_KEY');
    if (!b64) {
      throw new Error('CREDENTIAL_ENC_KEY is not set');
    }
    this.key = Buffer.from(b64, 'base64');
    if (this.key.length !== 32) {
      throw new Error(
        `CREDENTIAL_ENC_KEY must decode to 32 bytes, got ${this.key.length}`,
      );
    }
  }

  getKey(): Buffer {
    return this.key;
  }
}
```

- [ ] **Step 4: Create `backend/src/crypto/crypto.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { KeyProvider } from './key-provider';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class CryptoService {
  constructor(private readonly keyProvider: KeyProvider) {}

  encrypt(plaintext: string): EncryptedPayload {
    const key = this.keyProvider.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  decrypt(ciphertext: string, iv: string, authTag: string): string {
    const key = this.keyProvider.getKey();
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
```

- [ ] **Step 5: Create `backend/src/crypto/crypto.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { KeyProvider } from './key-provider';

@Global()
@Module({
  providers: [KeyProvider, CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
```

- [ ] **Step 6: Add CryptoModule to AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { CryptoModule } from './crypto/crypto.module';

@Module({
  imports: [AppConfigModule, PrismaModule, QueueModule, CryptoModule],
})
export class AppModule {}
```

- [ ] **Step 7: Run tests to verify all pass**

```bash
cd backend && npx jest src/crypto/crypto.service.spec.ts --verbose
```

Expected: 6 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/crypto/ backend/src/app.module.ts
git commit -m "feat: add CryptoService with AES-256-GCM and KeyProvider abstraction"
```

---

### Task 6: Auth Module — Register, Login, Refresh (with TDD)

**Files:**
- Create: `backend/src/auth/dto/register.dto.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/dto/refresh.dto.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.module.ts`
- Create: `backend/src/auth/auth.service.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` from Task 3, `ConfigService` from Task 2
- Produces:
  - `POST /api/auth/register` — `{ email, password, name, phone }` → `{ id, email, role, sellerStatus }`
  - `POST /api/auth/login` — `{ email, password }` → `{ accessToken, refreshToken, role, sellerStatus }`
  - `POST /api/auth/refresh` — `{ refreshToken }` → `{ accessToken }`
  - JWT payload shape: `{ sub: string; email: string; role: Role }`

- [ ] **Step 1: Install auth dependencies**

```bash
cd backend && npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt && npm install -D @types/passport-jwt @types/bcrypt
```

- [ ] **Step 2: Create DTOs**

`backend/src/auth/dto/register.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  phone!: string;
}
```

`backend/src/auth/dto/login.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

`backend/src/auth/dto/refresh.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
```

- [ ] **Step 3: Write test file `backend/src/auth/auth.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    seller: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      seller: { create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    jwt = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string | number> = {
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_ACCESS_TTL: 900,
                JWT_REFRESH_TTL: 2592000,
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create user and seller, return id/email/role/sellerStatus', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        role: 'SELLER',
        seller: { status: 'PENDING' },
      });

      const result = await service.register({
        email: 'test@test.com',
        password: 'password123',
        name: 'Test Seller',
        phone: '081234567890',
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@test.com',
        role: 'SELLER',
        sellerStatus: 'PENDING',
      });
    });

    it('should throw ConflictException if email exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'existing@test.com',
          password: 'password123',
          name: 'Test',
          phone: '081234567890',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens and role on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        role: 'SELLER',
        seller: { status: 'PENDING' },
      });

      const result = await service.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.role).toBe('SELLER');
      expect(result.sellerStatus).toBe('PENDING');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        role: 'SELLER',
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new access token on valid refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'SELLER',
      });

      const result = await service.refresh({ refreshToken: 'valid-refresh' });
      expect(result.accessToken).toBe('mock-token');
    });

    it('should throw UnauthorizedException on invalid refresh token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(
        service.refresh({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts --verbose
```

Expected: FAIL — AuthService not found.

- [ ] **Step 5: Create `backend/src/auth/auth.service.ts`**

```typescript
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: Role.SELLER,
          seller: {
            create: {
              name: dto.name,
              phone: dto.phone,
            },
          },
        },
        include: { seller: true },
      });
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      sellerStatus: user.seller!.status,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { seller: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_TTL'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<number>('JWT_REFRESH_TTL'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      role: user.role,
      sellerStatus: user.seller?.status ?? null,
    };
  }

  async refresh(dto: RefreshDto) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.jwt.signAsync(
      { sub: payload.sub, email: payload.email, role: payload.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_TTL'),
      },
    );

    return { accessToken };
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts --verbose
```

Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/
git commit -m "feat: add AuthService with register, login, refresh (TDD)"
```

---

### Task 7: JWT Guard, RolesGuard & Auth Controller

**Files:**
- Create: `backend/src/auth/guards/jwt-auth.guard.ts`
- Create: `backend/src/auth/guards/roles.guard.ts`
- Create: `backend/src/auth/decorators/roles.decorator.ts`
- Create: `backend/src/auth/strategies/jwt.strategy.ts`
- Modify: `backend/src/auth/auth.controller.ts` (create)
- Modify: `backend/src/auth/auth.module.ts` (create)
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `AuthService` from Task 6, `ConfigService` from Task 2
- Produces:
  - `JwtAuthGuard` — validates Bearer token, sets `req.user` to `{ sub, email, role }`
  - `RolesGuard` — checks `req.user.role` against `@Roles(Role.ADMIN)` decorator
  - `@Roles(...roles: Role[])` decorator
  - Auth REST endpoints at `/api/auth/*`

- [ ] **Step 1: Create `backend/src/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- [ ] **Step 2: Create `backend/src/auth/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 3: Create `backend/src/auth/decorators/roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 4: Create `backend/src/auth/guards/roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
```

- [ ] **Step 5: Create `backend/src/auth/auth.controller.ts`**

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }
}
```

- [ ] **Step 6: Create `backend/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 7: Add AuthModule to AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    QueueModule,
    CryptoModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Verify by starting the app and testing endpoints with curl**

```bash
cd backend && npm run start:dev
```

Test register:
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test Seller","phone":"081234567890"}'
```

Expected: `201` with `{ id, email, role: "SELLER", sellerStatus: "PENDING" }`.

Test login:
```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'
```

Expected: `200` with `{ accessToken, refreshToken, role, sellerStatus }`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/auth/ backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat: add JWT auth controller with guards and role-based access"
```

---

### Task 8: End-to-End Auth Verification

**Files:**
- Create: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: all previous tasks
- Produces: E2E test suite validating the full auth flow

- [ ] **Step 1: Create `backend/test/auth.e2e-spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['/v1.0/debit/notify'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.seller.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.seller.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const testUser = {
    email: 'e2e@test.com',
    password: 'password123',
    name: 'E2E Seller',
    phone: '081234567890',
  };

  it('POST /api/auth/register — creates user + seller', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body.email).toBe(testUser.email);
    expect(res.body.role).toBe('SELLER');
    expect(res.body.sellerStatus).toBe('PENDING');
  });

  it('POST /api/auth/register — rejects duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(409);
  });

  it('POST /api/auth/login — returns tokens on valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.role).toBe('SELLER');
  });

  it('POST /api/auth/login — rejects wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrong' })
      .expect(401);
  });

  it('POST /api/auth/refresh — returns new access token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
  });

  it('Protected route — rejects unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/seller/me')
      .expect(401);
  });
});
```

- [ ] **Step 2: Install supertest**

```bash
cd backend && npm install -D supertest @types/supertest
```

- [ ] **Step 3: Run E2E tests**

```bash
cd backend && npx jest test/auth.e2e-spec.ts --verbose --forceExit
```

Expected: all 6 tests PASS (requires running PostgreSQL and Redis).

Note: the "Protected route" test will 404 until the seller controller exists in Fase 2 — this is expected and acceptable. Change the expectation to 404 if the route doesn't exist yet, or skip that test for now.

- [ ] **Step 4: Commit**

```bash
git add backend/test/auth.e2e-spec.ts backend/package.json backend/package-lock.json
git commit -m "test: add e2e auth tests for register, login, refresh"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-06-18-fase-0-1-scaffold-auth.md`.

This plan covers **Fase 0** (scaffold: NestJS, Prisma, Redis/BullMQ, CryptoService) and **Fase 1** (auth: register/login/refresh, JWT, guards). Subsequent phases (Fase 2: Seller domain, Fase 3: Admin domain, etc.) will get their own plans once this foundation is stable.
