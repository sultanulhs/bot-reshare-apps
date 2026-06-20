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
      ownerName: s.ownerName,
      storeName: s.storeName,
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
      ownerName: seller.ownerName,
      storeName: seller.storeName,
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
