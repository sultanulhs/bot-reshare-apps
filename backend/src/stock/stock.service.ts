import { Injectable, Inject, NotFoundException, ForbiddenException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';
import { AddAccountDto } from './dto/add-account.dto';
import { AddSubAccountDto } from './dto/add-sub-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateSubAccountDto } from './dto/update-sub-account.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {}

  async addAccount(sellerId: string, durationId: string, dto: AddAccountDto) {
    const duration = await this.prisma.duration.findFirst({
      where: { id: durationId, deletedAt: null, app: { sellerId, deletedAt: null } },
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
      where: { id: accountId, deletedAt: null, duration: { deletedAt: null, app: { sellerId, deletedAt: null } } },
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
      where: { id: durationId, deletedAt: null, app: { sellerId, deletedAt: null } },
    });
    if (!duration) {
      throw new NotFoundException('Duration not found');
    }

    const accounts = await this.prisma.account.findMany({
      where: { durationId, deletedAt: null },
      include: {
        subAccounts: { where: { deletedAt: null }, select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const accountsWithExpired = await Promise.all(
      accounts.map(async (a) => {
        const expiredOrders = await this.prisma.order.count({
          where: {
            status: 'FULFILLED',
            accessExpiresAt: { lte: now },
            subAccount: { accountId: a.id },
          },
        });
        return {
          id: a.id,
          email: this.crypto.decrypt(a.encEmail, a.emailIv, a.emailTag),
          password: this.crypto.decrypt(a.encPassword, a.passwordIv, a.passwordTag),
          status: a.status,
          subAvailable: a.subAccounts.filter((s) => s.status === 'AVAILABLE').length,
          subLocked: a.subAccounts.filter((s) => s.status === 'LOCKED').length,
          subSold: a.subAccounts.filter((s) => s.status === 'SOLD').length,
          expiredCount: expiredOrders,
          createdAt: a.createdAt,
        };
      }),
    );
    return accountsWithExpired;
  }

  async listSubAccounts(accountId: string) {
    const subAccounts = await this.prisma.subAccount.findMany({
      where: { accountId, deletedAt: null },
      include: {
        order: {
          select: {
            buyerTgUserId: true,
            buyerName: true,
            buyerUsername: true,
            buyerInfo: true,
            status: true,
            accessExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return subAccounts.map((s) => {
      const isExpired = !!(
        s.order &&
        s.order.status === 'FULFILLED' &&
        s.order.accessExpiresAt &&
        s.order.accessExpiresAt <= now
      );
      return {
        id: s.id,
        name: this.crypto.decrypt(s.encName, s.nameIv, s.nameTag),
        pin: this.crypto.decrypt(s.encPin, s.pinIv, s.pinTag),
        status: s.status,
        isExpired,
        buyerTgUserId: s.order?.buyerTgUserId?.toString() || null,
        buyerName: s.order?.buyerName || null,
        buyerUsername: s.order?.buyerUsername || null,
        buyerInfo: s.order?.buyerInfo || null,
        orderStatus: s.order?.status || null,
        accessExpiresAt: s.order?.accessExpiresAt || null,
        createdAt: s.createdAt,
      };
    });
  }

  async updateAccount(sellerId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: { duration: { include: { app: { select: { sellerId: true } } } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your account');

    const data: any = {};
    if (dto.email !== undefined) {
      const enc = this.crypto.encrypt(dto.email);
      data.encEmail = enc.ciphertext;
      data.emailIv = enc.iv;
      data.emailTag = enc.authTag;
    }
    if (dto.password !== undefined) {
      const enc = this.crypto.encrypt(dto.password);
      data.encPassword = enc.ciphertext;
      data.passwordIv = enc.iv;
      data.passwordTag = enc.authTag;
    }

    const updated = await this.prisma.account.update({ where: { id }, data });

    // Notify active (non-expired) buyers if account has fulfilled orders via sub-accounts
    try {
      const activeOrders = await this.prisma.order.findMany({
        where: {
          status: 'FULFILLED',
          subAccount: { accountId: id },
          OR: [
            { accessExpiresAt: null },
            { accessExpiresAt: { gt: new Date() } },
          ],
        },
      });
      if (activeOrders.length > 0) {
        const newEmail = dto.email || this.crypto.decrypt(account.encEmail, account.emailIv, account.emailTag);
        const newPassword = dto.password || this.crypto.decrypt(account.encPassword, account.passwordIv, account.passwordTag);
        for (const activeOrder of activeOrders) {
          try {
            await this.telegramService.bot.api.sendMessage(
              activeOrder.buyerTgUserId.toString(),
              `⚠️ Info: Kredensial akun yang kamu beli telah diperbarui.\n📧 Email: ${newEmail}\n🔑 Password: ${newPassword}`,
            );
          } catch { /* ignore per-buyer failure */ }
        }
      }
    } catch {
      // Silently ignore notification failures
    }

    // Reset stock for expired orders after password change
    const now = new Date();
    const expiredOrders = await this.prisma.order.findMany({
      where: { status: 'FULFILLED', accessExpiresAt: { lte: now }, subAccount: { accountId: id } },
    });
    if (expiredOrders.length > 0) {
      for (const order of expiredOrders) {
        if (order.subAccountId) {
          await this.prisma.subAccount.update({
            where: { id: order.subAccountId },
            data: { status: 'AVAILABLE' },
          });
        }
      }
    }

    return updated;
  }

  async softDeleteAccount(sellerId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: { duration: { include: { app: { select: { sellerId: true } } } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your account');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.subAccount.updateMany({
        where: { accountId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.account.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ]);

    return { success: true };
  }

  async updateSubAccount(sellerId: string, id: string, dto: UpdateSubAccountDto) {
    const subAccount = await this.prisma.subAccount.findFirst({
      where: { id, deletedAt: null },
      include: { account: { include: { duration: { include: { app: { select: { sellerId: true } } } } } } },
    });
    if (!subAccount) throw new NotFoundException('Sub-account not found');
    if (subAccount.account.duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your sub-account');

    const data: any = {};
    if (dto.name !== undefined) {
      const enc = this.crypto.encrypt(dto.name);
      data.encName = enc.ciphertext;
      data.nameIv = enc.iv;
      data.nameTag = enc.authTag;
    }
    if (dto.pin !== undefined) {
      const enc = this.crypto.encrypt(dto.pin);
      data.encPin = enc.ciphertext;
      data.pinIv = enc.iv;
      data.pinTag = enc.authTag;
    }

    const updated = await this.prisma.subAccount.update({ where: { id }, data });

    // Reset stock if sub-account's order is expired and credentials were changed
    const expiredOrder = await this.prisma.order.findFirst({
      where: { subAccountId: id, status: 'FULFILLED', accessExpiresAt: { lte: new Date() } },
    });
    if (expiredOrder) {
      await this.prisma.subAccount.update({ where: { id }, data: { status: 'AVAILABLE' } });
    }

    return updated;
  }

  async softDeleteSubAccount(sellerId: string, id: string) {
    const subAccount = await this.prisma.subAccount.findFirst({
      where: { id, deletedAt: null },
      include: { account: { include: { duration: { include: { app: { select: { sellerId: true } } } } } } },
    });
    if (!subAccount) throw new NotFoundException('Sub-account not found');
    if (subAccount.account.duration.app.sellerId !== sellerId) throw new ForbiddenException('Not your sub-account');

    return this.prisma.subAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
