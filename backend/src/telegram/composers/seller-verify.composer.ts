import { Composer } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationService } from '../../verification/verification.service';

export function createSellerVerifyComposer(
  prisma: PrismaService,
  verificationService: VerificationService,
) {
  const composer = new Composer();

  composer.command('start', async (ctx, next) => {
    const payload = ctx.match;

    if (!payload || !payload.startsWith('verify_')) {
      return next();
    }

    const token = payload.replace('verify_', '');
    const tgUserId = BigInt(ctx.from!.id);

    const verification = await prisma.telegramVerification.findUnique({
      where: { token },
      include: { seller: true },
    });

    if (!verification) {
      await ctx.reply('Token verifikasi tidak valid. Silakan coba lagi dari aplikasi.');
      return;
    }

    if (verification.expiresAt < new Date()) {
      await ctx.reply('Token verifikasi sudah kedaluwarsa. Silakan mulai ulang dari aplikasi.');
      return;
    }

    // Save tgUserId to TelegramVerification
    await prisma.telegramVerification.update({
      where: { id: verification.id },
      data: { tgUserId },
    });

    // Generate phone OTP
    const code = await verificationService.generatePhoneOtp(verification.seller.userId);

    await ctx.reply(
      `Verifikasi nomor telepon untuk toko "${verification.seller.storeName}".\n\n` +
        `Kode verifikasi Anda: *${code}*\n\n` +
        `Masukkan kode ini di aplikasi untuk menyelesaikan verifikasi.\n` +
        `Kode berlaku selama 10 menit.`,
      { parse_mode: 'Markdown' },
    );
  });

  return composer;
}
