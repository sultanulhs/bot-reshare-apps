# Fase 4: Telegram Bot Pembeli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Telegram bot storefront for buyers using grammY. Supports deep-link multi-storefront, catalog browsing, buy flow (product selection → order placeholder), /myorders, and /report. The bot reads configuration from BotConfigService.

**Architecture:** grammY bot running inside NestJS via a TelegramModule. Buyer composers handle all buyer interactions. Deep link parameter `?start=<storeCode>` resolves seller affiliation. The bot does NOT handle payment/QRIS yet (Fase 5) or webhook fulfilment (Fase 6) — it creates order records and shows "payment pending" state.

**Tech Stack:** grammY, NestJS, Prisma, BotConfigService, CatalogService, inline keyboards

## Global Constraints

- Bot is BUYER-ONLY — no seller/admin functions in the bot
- Buyer identified by tgUserId (ctx.from.id) — no phone number collection
- Deep link: `?start=<storeCode>` → resolve seller → save BuyerAffiliation
- Catalog filtered by affiliated seller's products (ACTIVE products with AVAILABLE stock)
- Credentials NEVER sent via bot until fulfilment (Fase 6) — bot only shows order status
- BotConfig.welcomeText used in /start response
- All text in Indonesian (Bahasa)

---

### Task 1: grammY Bot Setup & TelegramModule

**Files:**
- Create: `backend/src/telegram/telegram.module.ts`
- Create: `backend/src/telegram/telegram.service.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ConfigService` (TELEGRAM_BOT_TOKEN)
- Produces: `TelegramService` with running grammY Bot instance, `TelegramModule`

- [ ] **Step 1: Install grammY**

```bash
cd backend && npm install grammy
```

- [ ] **Step 2: Create `backend/src/telegram/telegram.service.ts`**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot<Context>;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    this.bot = new Bot<Context>(token);
  }

  async onModuleInit() {
    this.bot.catch((err) => {
      this.logger.error('Bot error:', err.message);
    });

    this.bot.start({
      onStart: () => this.logger.log('Telegram bot started'),
    });
  }
}
```

- [ ] **Step 3: Create `backend/src/telegram/telegram.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CatalogModule } from '../catalog/catalog.module';
import { BotConfigModule } from '../botconfig/botconfig.module';

@Module({
  imports: [CatalogModule, BotConfigModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 4: Add TelegramModule to AppModule**

Add to imports in `backend/src/app.module.ts`.

- [ ] **Step 5: Verify build**

```bash
cd backend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/telegram/ backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat: add grammY bot setup with TelegramModule"
```

---

### Task 2: Deep Link /start & Buyer Affiliation

**Files:**
- Create: `backend/src/telegram/composers/buyer.composer.ts`
- Modify: `backend/src/telegram/telegram.service.ts`
- Modify: `backend/src/telegram/telegram.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `BotConfigService`
- Produces: `/start` command handler that:
  1. Reads deep link payload (storeCode)
  2. Resolves seller by storeCode
  3. Upserts BuyerAffiliation (tgUserId → sellerId)
  4. Shows welcome text from BotConfig
  5. Shows store name and inline keyboard with [Lihat Katalog] button

- [ ] **Step 1: Create `backend/src/telegram/composers/buyer.composer.ts`**

```typescript
import { Composer, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { BotConfigService } from '../../botconfig/botconfig.service';
import { CatalogService } from '../../catalog/catalog.service';

export function createBuyerComposer(
  prisma: PrismaService,
  botConfigService: BotConfigService,
  catalogService: CatalogService,
) {
  const composer = new Composer();

  composer.command('start', async (ctx) => {
    const payload = ctx.match;
    const tgUserId = BigInt(ctx.from!.id);

    if (payload) {
      const seller = await prisma.seller.findUnique({
        where: { storeCode: payload },
      });

      if (seller && seller.status === 'ACTIVE') {
        await prisma.buyerAffiliation.upsert({
          where: { buyerTgUserId: tgUserId },
          update: { sellerId: seller.id },
          create: { buyerTgUserId: tgUserId, sellerId: seller.id },
        });
      }
    }

    const affiliation = await prisma.buyerAffiliation.findUnique({
      where: { buyerTgUserId: tgUserId },
      include: { seller: true },
    });

    const config = await botConfigService.getConfig();
    const welcomeText = config.welcomeText || 'Selamat datang di marketplace akun premium!';

    if (affiliation?.seller) {
      const keyboard = new InlineKeyboard()
        .text('📋 Lihat Katalog', 'catalog')
        .row()
        .text('📦 Pesanan Saya', 'myorders');

      await ctx.reply(
        `${welcomeText}\n\n🏪 Toko: ${affiliation.seller.name}\n\nPilih menu di bawah:`,
        { reply_markup: keyboard },
      );
    } else {
      await ctx.reply(
        `${welcomeText}\n\n⚠️ Anda belum terhubung ke toko mana pun. Gunakan link toko untuk mulai berbelanja.`,
      );
    }
  });

  composer.callbackQuery('catalog', async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgUserId = BigInt(ctx.from.id);

    const affiliation = await prisma.buyerAffiliation.findUnique({
      where: { buyerTgUserId: tgUserId },
    });

    if (!affiliation) {
      await ctx.reply('⚠️ Anda belum terhubung ke toko. Gunakan link toko untuk mulai.');
      return;
    }

    const products = await catalogService.listProducts(affiliation.sellerId);
    const available = products.filter((p) => p.active && p.stockCount.available > 0);

    if (available.length === 0) {
      await ctx.reply('😔 Tidak ada produk tersedia saat ini.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const product of available) {
      keyboard
        .text(
          `${product.title} - Rp${product.basePrice.toLocaleString('id-ID')} (${product.stockCount.available} tersedia)`,
          `buy_${product.id}`,
        )
        .row();
    }

    await ctx.reply('📋 *Katalog Produk*\n\nPilih produk untuk membeli:', {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  });

  composer.callbackQuery(/^buy_(.+)$/, async (ctx) => {
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

    const products = await catalogService.listProducts(affiliation.sellerId);
    const product = products.find((p) => p.id === productId);

    if (!product || !product.active || product.stockCount.available === 0) {
      await ctx.reply('❌ Produk tidak tersedia.');
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Konfirmasi Beli', `confirm_${productId}`)
      .text('❌ Batal', 'catalog');

    await ctx.reply(
      `🛒 *Detail Produk*\n\n` +
        `📦 ${product.title}\n` +
        `💰 Harga: Rp${product.basePrice.toLocaleString('id-ID')}\n` +
        `📁 Kategori: ${product.category}\n\n` +
        `_Harga final akan ditampilkan saat pembayaran._\n\n` +
        `Konfirmasi pembelian?`,
      { reply_markup: keyboard, parse_mode: 'Markdown' },
    );
  });

  composer.callbackQuery(/^confirm_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match![1];

    await ctx.reply(
      `⏳ Pesanan sedang diproses...\n\n` +
        `Fitur pembayaran QRIS akan tersedia di update berikutnya.\n` +
        `Product ID: ${productId}`,
    );
  });

  composer.callbackQuery('myorders', async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgUserId = BigInt(ctx.from.id);

    const orders = await prisma.order.findMany({
      where: { buyerTgUserId: tgUserId },
      include: {
        stockUnit: {
          select: { product: { select: { title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (orders.length === 0) {
      await ctx.reply('📦 Anda belum memiliki pesanan.');
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '⏳',
      PAID: '💰',
      WAITING_SELLER: '⏰',
      FULFILLED: '✅',
      EXPIRED: '❌',
      FAILED: '❌',
    };

    const lines = orders.map((o) => {
      const emoji = statusEmoji[o.status] || '❓';
      const title = o.stockUnit?.product?.title || 'Produk';
      return `${emoji} ${title} - Rp${o.totalAmount.toLocaleString('id-ID')} [${o.status}]`;
    });

    await ctx.reply(`📦 *Pesanan Saya*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  composer.command('myorders', async (ctx) => {
    const tgUserId = BigInt(ctx.from!.id);

    const orders = await prisma.order.findMany({
      where: { buyerTgUserId: tgUserId },
      include: {
        stockUnit: {
          select: { product: { select: { title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (orders.length === 0) {
      await ctx.reply('📦 Anda belum memiliki pesanan.');
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '⏳',
      PAID: '💰',
      WAITING_SELLER: '⏰',
      FULFILLED: '✅',
      EXPIRED: '❌',
      FAILED: '❌',
    };

    const lines = orders.map((o) => {
      const emoji = statusEmoji[o.status] || '❓';
      const title = o.stockUnit?.product?.title || 'Produk';
      return `${emoji} ${title} - Rp${o.totalAmount.toLocaleString('id-ID')} [${o.status}]`;
    });

    await ctx.reply(`📦 *Pesanan Saya*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  composer.command('report', async (ctx) => {
    const tgUserId = BigInt(ctx.from!.id);
    const args = ctx.match;

    if (!args) {
      await ctx.reply(
        '📝 Untuk melapor, gunakan:\n/report <pesan>\n\nContoh: /report Akun tidak bisa login',
      );
      return;
    }

    const affiliation = await prisma.buyerAffiliation.findUnique({
      where: { buyerTgUserId: tgUserId },
    });

    if (!affiliation) {
      await ctx.reply('⚠️ Anda belum terhubung ke toko.');
      return;
    }

    const lastOrder = await prisma.order.findFirst({
      where: { buyerTgUserId: tgUserId, status: 'FULFILLED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastOrder) {
      await ctx.reply('⚠️ Anda belum memiliki pesanan yang selesai untuk dilaporkan.');
      return;
    }

    await prisma.report.create({
      data: {
        orderId: lastOrder.id,
        buyerTgUserId: tgUserId,
        sellerId: affiliation.sellerId,
        message: args,
      },
    });

    await ctx.reply(
      '✅ Laporan Anda telah dikirim ke penjual. Kami akan memproses segera.',
    );
  });

  return composer;
}
```

- [ ] **Step 2: Update TelegramService to use composer**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfigService } from '../botconfig/botconfig.service';
import { CatalogService } from '../catalog/catalog.service';
import { createBuyerComposer } from './composers/buyer.composer';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot<Context>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly botConfigService: BotConfigService,
    private readonly catalogService: CatalogService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    this.bot = new Bot<Context>(token);
  }

  async onModuleInit() {
    const buyerComposer = createBuyerComposer(
      this.prisma,
      this.botConfigService,
      this.catalogService,
    );
    this.bot.use(buyerComposer);

    this.bot.catch((err) => {
      this.logger.error('Bot error:', err.message);
    });

    this.bot.start({
      onStart: () => this.logger.log('Telegram bot started'),
    });
  }
}
```

- [ ] **Step 3: Update TelegramModule**

```typescript
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CatalogModule } from '../catalog/catalog.module';
import { BotConfigModule } from '../botconfig/botconfig.module';

@Module({
  imports: [CatalogModule, BotConfigModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 4: Verify build and tests**

```bash
cd backend && npm run build && npx jest --verbose
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/
git commit -m "feat: add buyer bot with deep link, catalog, orders, and report commands"
```
