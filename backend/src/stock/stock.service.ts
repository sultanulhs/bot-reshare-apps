import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AddAccountDto } from './dto/add-account.dto';
import { AddSubAccountDto } from './dto/add-sub-account.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async addAccount(sellerId: string, durationId: string, dto: AddAccountDto) {
    const duration = await this.prisma.duration.findFirst({
      where: { id: durationId, app: { sellerId } },
    });
    if (!duration) {
      throw new NotFoundException('Duration not found');
    }

    const encEmail = this.crypto.encrypt(dto.email);
    const encPassword = this.crypto.encrypt(dto.password);

    const account = await this.prisma.account.create({
      data: {
        durationId,
        encEmail: encEmail.ciphertext,
        emailIv: encEmail.iv,
        emailTag: encEmail.authTag,
        encPassword: encPassword.ciphertext,
        passwordIv: encPassword.iv,
        passwordTag: encPassword.authTag,
        status: 'AVAILABLE',
      },
    });

    return { accountId: account.id, status: account.status };
  }

  async addSubAccount(sellerId: string, accountId: string, dto: AddSubAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, duration: { app: { sellerId } } },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const encName = this.crypto.encrypt(dto.name);
    const encPin = this.crypto.encrypt(dto.pin);

    const subAccount = await this.prisma.subAccount.create({
      data: {
        accountId,
        encName: encName.ciphertext,
        nameIv: encName.iv,
        nameTag: encName.authTag,
        encPin: encPin.ciphertext,
        pinIv: encPin.iv,
        pinTag: encPin.authTag,
        status: 'AVAILABLE',
      },
    });

    return { subAccountId: subAccount.id, status: subAccount.status };
  }

  async listAccounts(sellerId: string, durationId: string) {
    const duration = await this.prisma.duration.findFirst({
      where: { id: durationId, app: { sellerId } },
    });
    if (!duration) {
      throw new NotFoundException('Duration not found');
    }

    return this.prisma.account.findMany({
      where: { durationId },
      select: {
        id: true,
        durationId: true,
        status: true,
        createdAt: true,
        _count: { select: { subAccounts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSubAccounts(accountId: string) {
    return this.prisma.subAccount.findMany({
      where: { accountId },
      select: {
        id: true,
        accountId: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
