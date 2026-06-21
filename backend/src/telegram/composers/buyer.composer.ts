import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { BotConfigService } from '../../botconfig/botconfig.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrderService } from '../../order/order.service';
import { FulfilmentService } from '../../webhook/fulfilment.service';

const isTestPayEnabled = process.env.TEST_PAYMENT_ENABLED === 'true';

export function createBuyerComposer(
  prisma: PrismaService,
  botConfigService: BotConfigService,
  catalogService: CatalogService,
  orderService: OrderService,
  fulfilmentService: FulfilmentService,
) {
  const composer = new Composer();

  composer.command('start', async (ctx) => {
    const payload = ctx.match;
    const tgUserId = BigInt(ctx.from!.id);

    // Skip verify_ payloads — handled by seller-verify composer
    if (payload && payload.startsWith('verify_')) {
      return;
    }

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
        .text('\u{1F4CB} Lihat Kategori', 'catalog')
        .row()
        .text('\u{1F4E6} Pesanan Saya', 'myorders');

      await ctx.reply(
        `${welcomeText}\n\n\u{1F3EA} Toko: ${affiliation.seller.storeName}\n\nPilih menu di bawah:`,
        { reply_markup: keyboard },
      );
    } else {
      await ctx.reply(
        `${welcomeText}\n\n⚠️ Anda belum terhubung ke toko mana pun. Gunakan link toko untuk mulai berbelanja.`,
      );
    }
  });

  // catalog → list categories
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

    const categories = await catalogService.getCategories(affiliation.sellerId);
    const allApps = await catalogService.getApps(affiliation.sellerId);

    // Build stock count per category
    const catStock = new Map<string, number>();
    for (const app of allApps) {
      const catId = app.template.category.id;
      catStock.set(catId, (catStock.get(catId) ?? 0) + (app.stockAvailable ?? 0));
    }

    // Filter: only show categories that have at least one app
    const catsWithApps = new Set(allApps.map((a: any) => a.template.category.id));
    const filtered = categories.filter((c: any) => catsWithApps.has(c.id));

    if (filtered.length === 0) {
      await ctx.reply('\u{1F614} Tidak ada kategori tersedia saat ini.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const cat of filtered) {
      const stock = catStock.get(cat.id) ?? 0;
      const stockLabel = stock > 0 ? ` (${stock} tersedia)` : ' (Habis)';
      keyboard
        .text(`${cat.icon ?? ''} ${cat.name}${stockLabel}`.trim(), `cat_${cat.id}`)
        .row();
    }

    await ctx.reply('\u{1F4CB} *Kategori*\n\nPilih kategori:', {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  });

  // cat_<categoryId> → list apps in category
  composer.callbackQuery(/^cat_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const categoryId = ctx.match![1];
    const tgUserId = BigInt(ctx.from.id);

    const affiliation = await prisma.buyerAffiliation.findUnique({
      where: { buyerTgUserId: tgUserId },
    });

    if (!affiliation) {
      await ctx.reply('⚠️ Anda belum terhubung ke toko.');
      return;
    }

    const apps = await catalogService.getApps(affiliation.sellerId, categoryId);

    if (apps.length === 0) {
      await ctx.reply('\u{1F614} Tidak ada aplikasi tersedia di kategori ini.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const app of apps) {
      const stock = (app as any).stockAvailable ?? 0;
      const indicator = stock > 0 ? ' ✅' : ' ❌ Habis';
      keyboard.text(`${app.template.name}${indicator}`, `app_${app.id}`).row();
    }
    keyboard.text('\u{2B05}️ Kembali', 'catalog').row();

    await ctx.reply('\u{1F4F1} *Pilih Aplikasi*\n\nPilih aplikasi yang ingin dibeli:', {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  });

  // app_<appId> → list durations with prices
  composer.callbackQuery(/^app_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const appId = ctx.match![1];

    const appWithStock = await catalogService.getAppWithStock(appId);

    if (!appWithStock || appWithStock.durations.length === 0) {
      await ctx.reply('❌ Tidak ada paket tersedia untuk aplikasi ini.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const dur of appWithStock.durations) {
      const stock = (dur as any).stockAvailable ?? 0;
      const indicator = stock > 0 ? ' ✅' : ' ❌';
      keyboard
        .text(
          `${dur.label} - Rp${dur.basePrice.toLocaleString('id-ID')}${indicator}`,
          `buy_${dur.id}`,
        )
        .row();
    }
    if (appWithStock.template?.category) {
      keyboard.text('\u{2B05}️ Kembali', `cat_${appWithStock.template.category.id}`).row();
    }

    let message = `\u{1F4F1} *${appWithStock.template.name}*\n`;
    if (appWithStock.notes) {
      message += `\u{1F4DD} Ketentuan: ${appWithStock.notes}\n`;
    }
    message += `\nPilih durasi langganan:`;

    await ctx.reply(message, { reply_markup: keyboard, parse_mode: 'Markdown' });
  });

  // buy_<durationId> → show detail + confirm button
  composer.callbackQuery(/^buy_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const durationId = ctx.match![1];

    const duration = await prisma.duration.findUnique({
      where: { id: durationId },
      include: { app: { include: { template: true } } },
    });

    if (!duration || !duration.active) {
      await ctx.reply('❌ Paket tidak tersedia.');
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Konfirmasi Beli', `confirm_${durationId}`)
      .text('❌ Batal', `app_${duration.appId}`);

    await ctx.reply(
      `\u{1F6D2} *Detail Paket*\n\n` +
        `\u{1F4F1} ${duration.app.template.name}\n` +
        `\u{23F3} Durasi: ${duration.label}\n` +
        `\u{1F4B0} Harga: Rp${duration.basePrice.toLocaleString('id-ID')}\n\n` +
        `_Harga final akan ditampilkan saat pembayaran._\n\n` +
        `Konfirmasi pembelian?`,
      { reply_markup: keyboard, parse_mode: 'Markdown' },
    );
  });

  // confirm_<durationId> → create order
  composer.callbackQuery(/^confirm_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const durationId = ctx.match![1];
    const tgUserId = BigInt(ctx.from.id);

    const affiliation = await prisma.buyerAffiliation.findUnique({
      where: { buyerTgUserId: tgUserId },
    });

    if (!affiliation) {
      await ctx.reply('⚠️ Anda belum terhubung ke toko.');
      return;
    }

    try {
      const buyerName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || undefined;
      const buyerUsername = ctx.from.username || undefined;

      const order = await orderService.createOrder({
        buyerTgUserId: tgUserId,
        buyerName,
        buyerUsername,
        durationId,
        sellerId: affiliation.sellerId,
      });

      const qrKeyboard = isTestPayEnabled
        ? new InlineKeyboard().text('🧪 Simulasi Bayar (Testing)', `testpay_${order.partnerReferenceNo}`)
        : undefined;

      await ctx.replyWithPhoto(
        new InputFile(order.qrImage, 'qris.png'),
        {
          caption:
            `\u{1F4B3} *Pembayaran QRIS*\n\n` +
            `Total: Rp${order.totalAmount.toLocaleString('id-ID')}\n` +
            `Berlaku sampai: ${order.expiresAt.toLocaleString('id-ID')}\n\n` +
            `Scan QR di atas untuk membayar via DANA.\n` +
            `Order ID: \`${order.orderId}\``,
          parse_mode: 'Markdown',
          reply_markup: qrKeyboard,
        },
      );
    } catch (err: any) {
      await ctx.reply(`❌ Gagal membuat pesanan: ${err.message}`);
    }
  });

  // Test payment handler — only active when TEST_PAYMENT_ENABLED=true
  composer.callbackQuery(/^testpay_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    if (!isTestPayEnabled) {
      await ctx.reply('❌ Simulasi pembayaran tidak aktif.');
      return;
    }

    const partnerReferenceNo = ctx.match![1];

    try {
      // Check if order is still PENDING before processing
      const order = await prisma.order.findFirst({ where: { partnerReferenceNo } });
      if (!order || order.status !== 'PENDING') {
        await ctx.reply('❌ Pesanan sudah kedaluwarsa atau tidak ditemukan. Silakan buat pesanan baru.');
        return;
      }

      await fulfilmentService.handlePaymentNotification({
        originalPartnerReferenceNo: partnerReferenceNo,
      });
      await ctx.reply('✅ Pembayaran simulasi berhasil diproses! Cek pesan berikutnya untuk kredensial.');
    } catch (err: any) {
      await ctx.reply(`❌ Gagal memproses pembayaran simulasi: ${err.message}`);
    }
  });

  composer.callbackQuery('myorders', async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgUserId = BigInt(ctx.from.id);

    const orders = await prisma.order.findMany({
      where: { buyerTgUserId: tgUserId },
      include: {
        duration: {
          select: { label: true, app: { select: { template: { select: { name: true } } } } },
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
      const title = o.duration?.app?.template?.name ?? 'Produk';
      const label = o.duration?.label ?? '';
      return `${emoji} ${title}${label ? ` (${label})` : ''} - Rp${o.totalAmount.toLocaleString('id-ID')} [${o.status}]`;
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
        duration: {
          select: { label: true, app: { select: { template: { select: { name: true } } } } },
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
      const title = o.duration?.app?.template?.name ?? 'Produk';
      const label = o.duration?.label ?? '';
      return `${emoji} ${title}${label ? ` (${label})` : ''} - Rp${o.totalAmount.toLocaleString('id-ID')} [${o.status}]`;
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
