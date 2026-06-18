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
        .text('\u{1F4CB} Lihat Katalog', 'catalog')
        .row()
        .text('\u{1F4E6} Pesanan Saya', 'myorders');

      await ctx.reply(
        `${welcomeText}\n\n\u{1F3EA} Toko: ${affiliation.seller.name}\n\nPilih menu di bawah:`,
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
      await ctx.reply('\u{1F614} Tidak ada produk tersedia saat ini.');
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

    await ctx.reply('\u{1F4CB} *Katalog Produk*\n\nPilih produk untuk membeli:', {
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
      `\u{1F6D2} *Detail Produk*\n\n` +
        `\u{1F4E6} ${product.title}\n` +
        `\u{1F4B0} Harga: Rp${product.basePrice.toLocaleString('id-ID')}\n` +
        `\u{1F4C1} Kategori: ${product.category}\n\n` +
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
      await ctx.reply('\u{1F4E6} Anda belum memiliki pesanan.');
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '⏳',
      PAID: '\u{1F4B0}',
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

    await ctx.reply(`\u{1F4E6} *Pesanan Saya*\n\n${lines.join('\n')}`, {
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
      await ctx.reply('\u{1F4E6} Anda belum memiliki pesanan.');
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '⏳',
      PAID: '\u{1F4B0}',
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

    await ctx.reply(`\u{1F4E6} *Pesanan Saya*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  composer.command('report', async (ctx) => {
    const tgUserId = BigInt(ctx.from!.id);
    const args = ctx.match;

    if (!args) {
      await ctx.reply(
        '\u{1F4DD} Untuk melapor, gunakan:\n/report <pesan>\n\nContoh: /report Akun tidak bisa login',
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
