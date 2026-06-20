import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM')!;
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT'),
      secure: this.config.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendOtp(email: string, code: string): Promise<void> {
    const subject = 'Kode Verifikasi Email - reShare';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verifikasi Email Anda</h2>
        <p>Gunakan kode berikut untuk memverifikasi alamat email Anda:</p>
        <div style="background: #f4f4f4; padding: 16px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; margin-top: 16px;">Kode ini berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.</p>
        <p style="color: #999; font-size: 12px;">Jika Anda tidak meminta kode ini, abaikan email ini.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject,
        html,
      });
      this.logger.log(`OTP email sent to ${email}`);
    } catch (err: any) {
      this.logger.warn(`Failed to send OTP email to ${email}: ${err.message} (SMTP not configured — OTP logged for dev)`);
      this.logger.debug(`[DEV] OTP for ${email}: ${code}`);
    }
  }
}
