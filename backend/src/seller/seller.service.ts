import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SubmitProfileDto } from './dto/submit-profile.dto';

@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
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
      ownerName: seller.ownerName,
      storeName: seller.storeName,
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
}
