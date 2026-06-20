import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpChannel } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

interface VerifyTokenPayload {
  sub: string;
  purpose: string;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /** Decode and validate a verifyToken JWT */
  async decodeVerifyToken(token: string): Promise<string> {
    let payload: VerifyTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<VerifyTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token verifikasi tidak valid atau sudah kedaluwarsa');
    }
    if (payload.purpose !== 'verify') {
      throw new UnauthorizedException('Token bukan untuk verifikasi');
    }
    return payload.sub;
  }

  /** Issue a verifyToken JWT (purpose: 'verify', TTL 30min) */
  async issueVerifyToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, purpose: 'verify' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: 1800, // 30 minutes
      },
    );
  }

  /** Generate 6-digit OTP, hash it, save to Otp table, send via email */
  async generateEmailOtp(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Pengguna tidak ditemukan');

    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous OTPs for this user/channel
    await this.prisma.otp.updateMany({
      where: { userId, channel: OtpChannel.EMAIL, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otp.create({
      data: {
        userId,
        channel: OtpChannel.EMAIL,
        codeHash,
        expiresAt,
      },
    });

    await this.email.sendOtp(user.email, code);
    this.logger.log(`Email OTP generated for user ${userId}`);
  }

  /** Verify email OTP: check hash, expiry, attempts, set emailVerified=true */
  async verifyEmailOtp(userId: string, code: string): Promise<void> {
    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        channel: OtpChannel.EMAIL,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Kode OTP tidak ditemukan. Silakan minta kode baru.');
    }

    if (otp.attempts >= 5) {
      throw new BadRequestException('Terlalu banyak percobaan. Silakan minta kode baru.');
    }

    if (otp.expiresAt < new Date()) {
      throw new BadRequestException('Kode OTP sudah kedaluwarsa. Silakan minta kode baru.');
    }

    // Increment attempts
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      throw new BadRequestException('Kode OTP tidak valid');
    }

    // Mark consumed and set emailVerified
    await this.prisma.$transaction([
      this.prisma.otp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
    ]);

    this.logger.log(`Email verified for user ${userId}`);
  }

  /** Create TelegramVerification record, return deep link */
  async startPhoneVerification(sellerId: string): Promise<{ deepLink: string }> {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new BadRequestException('Penjual tidak ditemukan');

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.telegramVerification.upsert({
      where: { sellerId },
      update: { token, expiresAt, tgUserId: null },
      create: { sellerId, token, expiresAt },
    });

    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    const deepLink = `https://t.me/${botUsername}?start=verify_${token}`;

    this.logger.log(`Phone verification started for seller ${sellerId}`);
    return { deepLink };
  }

  /** Verify phone OTP: check hash, expiry, attempts, set phoneVerified=true, save tgUserId */
  async verifyPhoneOtp(sellerId: string, code: string): Promise<void> {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new BadRequestException('Penjual tidak ditemukan');

    const otp = await this.prisma.otp.findFirst({
      where: {
        userId: seller.userId,
        channel: OtpChannel.PHONE,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Kode OTP tidak ditemukan. Silakan buka link Telegram terlebih dahulu.');
    }

    if (otp.attempts >= 5) {
      throw new BadRequestException('Terlalu banyak percobaan. Silakan mulai verifikasi ulang.');
    }

    if (otp.expiresAt < new Date()) {
      throw new BadRequestException('Kode OTP sudah kedaluwarsa. Silakan mulai verifikasi ulang.');
    }

    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      throw new BadRequestException('Kode OTP tidak valid');
    }

    // Get tgUserId from TelegramVerification
    const tgVerification = await this.prisma.telegramVerification.findUnique({
      where: { sellerId },
    });

    if (!tgVerification?.tgUserId) {
      throw new BadRequestException('Verifikasi Telegram belum selesai. Silakan buka link Telegram terlebih dahulu.');
    }

    await this.prisma.$transaction([
      this.prisma.otp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.seller.update({
        where: { id: sellerId },
        data: {
          phoneVerified: true,
          tgUserId: tgVerification.tgUserId,
        },
      }),
    ]);

    this.logger.log(`Phone verified for seller ${sellerId}`);
  }

  /** Generate a phone OTP (called by Telegram bot) */
  async generatePhoneOtp(userId: string): Promise<string> {
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate previous phone OTPs
    await this.prisma.otp.updateMany({
      where: { userId, channel: OtpChannel.PHONE, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otp.create({
      data: {
        userId,
        channel: OtpChannel.PHONE,
        codeHash,
        expiresAt,
      },
    });

    return code;
  }
}
