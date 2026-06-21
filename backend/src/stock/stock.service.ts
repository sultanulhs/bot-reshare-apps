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

  private buildCredentialMessage(
    packageName: string,
    email: string,
    password: string,
    subName?: string,
    pin?: string,
  ): string {
    let msg = `⚠️ Info: Kredensial *${packageName}* telah diperbarui.\n📧 Email: ${email}\n🔑 Password: ${password}`;
    if (subName) {
      msg += `\n👤 Profil: ${subName}\n🔐 PIN: ${pin}`;
    }
    return msg;
  }

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
        hasSubAccounts: dto.hasSubAccounts ?? true,
      },
    });

    return { accountId: account.id, status: account.status, hasSubAccounts: account.hasSubAccounts };
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
        order: {
          select: {
            buyerTgUserId: true, buyerName: true, buyerUsername: true,
            buyerInfo: true, status: true, expiresAt: true, accessExpiresAt: true,
          },
        },
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
            OR: [
              { subAccount: { accountId: a.id } },
              { accountId: a.id },
            ],
          },
        });
        const isExpired = !!(
          a.order &&
          a.order.status === 'FULFILLED' &&
          a.order.accessExpiresAt &&
          a.order.accessExpiresAt <= now
        );
        return {
          id: a.id,
          email: this.crypto.decrypt(a.encEmail, a.emailIv, a.emailTag),
          password: this.crypto.decrypt(a.encPassword, a.passwordIv, a.passwordTag),
          status: a.status,
          hasSubAccounts: a.hasSubAccounts,
          subAvailable: a.subAccounts.filter((s) => s.status === 'AVAILABLE').length,
          subLocked: a.subAccounts.filter((s) => s.status === 'LOCKED').length,
          subSold: a.subAccounts.filter((s) => s.status === 'SOLD').length,
          expiredCount: expiredOrders,
          isExpired,
          buyerTgUserId: a.order?.buyerTgUserId?.toString() || null,
          buyerName: a.order?.buyerName || null,
          buyerUsername: a.order?.buyerUsername || null,
          buyerInfo: a.order?.buyerInfo || null,
          orderStatus: a.order?.status || null,
          expiresAt: a.order?.expiresAt || null,
          accessExpiresAt: a.order?.accessExpiresAt || null,
          createdAt: a.createdAt,
        };
      }),
    );

    // MANUAL orders for this duration
    const manualOrders = duration.productType === 'MANUAL'
      ? (await this.prisma.order.findMany({
          where: { durationId },
          orderBy: { createdAt: 'desc' },
        })).map((o) => ({
          id: o.id,
          status: o.status,
          buyerName: o.buyerName,
          buyerUsername: o.buyerUsername,
          buyerTgUserId: o.buyerTgUserId.toString(),
          buyerInfo: o.buyerInfo,
          totalAmount: o.totalAmount,
          createdAt: o.createdAt,
          fulfilledAt: o.fulfilledAt,
          accessExpiresAt: o.accessExpiresAt,
          expiresAt: o.expiresAt,
        }))
      : [];

    return { accounts: accountsWithExpired, manualOrders };
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
            expiresAt: true,
            accessExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
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
        expiresAt: s.order?.expiresAt || null,
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
    if (dto.hasSubAccounts !== undefined) {
      data.hasSubAccounts = dto.hasSubAccounts;
    }

    const updated = await this.prisma.account.update({ where: { id }, data });

    // Notify active (non-expired) buyers with full credential details
    try {
      const activeOrders = await this.prisma.order.findMany({
        where: {
          status: 'FULFILLED',
          OR: [
            { subAccount: { accountId: id }, accessExpiresAt: null },
            { subAccount: { accountId: id }, accessExpiresAt: { gt: new Date() } },
            { accountId: id, accessExpiresAt: null },
            { accountId: id, accessExpiresAt: { gt: new Date() } },
          ],
        },
        include: {
          subAccount: true,
          duration: { include: { app: { include: { template: true } } } },
        },
      });
      if (activeOrders.length > 0) {
        const newEmail = dto.email || this.crypto.decrypt(account.encEmail, account.emailIv, account.emailTag);
        const newPassword = dto.password || this.crypto.decrypt(account.encPassword, account.passwordIv, account.passwordTag);
        for (const activeOrder of activeOrders) {
          try {
            const packageName = activeOrder.duration?.app?.template?.name ?? 'Akun';
            let subName: string | undefined;
            let subPin: string | undefined;
            if (activeOrder.subAccount) {
              subName = this.crypto.decrypt(activeOrder.subAccount.encName, activeOrder.subAccount.nameIv, activeOrder.subAccount.nameTag);
              subPin = this.crypto.decrypt(activeOrder.subAccount.encPin, activeOrder.subAccount.pinIv, activeOrder.subAccount.pinTag);
            }
            const msg = this.buildCredentialMessage(packageName, newEmail, newPassword, subName, subPin);
            await this.telegramService.bot.api.sendMessage(activeOrder.buyerTgUserId.toString(), msg);
          } catch { /* ignore per-buyer failure */ }
        }
      }
    } catch {
      // Silently ignore notification failures
    }

    // Reset stock for expired orders after password change
    const now = new Date();
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: 'FULFILLED',
        accessExpiresAt: { lte: now },
        OR: [
          { subAccount: { accountId: id } },
          { accountId: id },
        ],
      },
    });
    if (expiredOrders.length > 0) {
      for (const order of expiredOrders) {
        if (order.subAccountId) {
          await this.prisma.subAccount.update({
            where: { id: order.subAccountId },
            data: { status: 'AVAILABLE' },
          });
        }
        if (order.accountId) {
          await this.prisma.account.update({
            where: { id: order.accountId },
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
      include: { account: true },
    });
    if (!subAccount) throw new NotFoundException('Sub-account not found');

    // Check ownership via duration → app → seller
    const accountWithSeller = await this.prisma.account.findFirst({
      where: { id: subAccount.accountId },
      include: { duration: { include: { app: { select: { sellerId: true } } } } },
    });
    if (!accountWithSeller || accountWithSeller.duration.app.sellerId !== sellerId) {
      throw new ForbiddenException('Not your sub-account');
    }

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

    // Notify active (non-expired) buyer with full credential details
    try {
      const activeOrder = await this.prisma.order.findFirst({
        where: {
          subAccountId: id,
          status: 'FULFILLED',
          OR: [
            { accessExpiresAt: null },
            { accessExpiresAt: { gt: new Date() } },
          ],
        },
        include: { duration: { include: { app: { include: { template: true } } } } },
      });
      if (activeOrder) {
        const email = this.crypto.decrypt(subAccount.account.encEmail, subAccount.account.emailIv, subAccount.account.emailTag);
        const password = this.crypto.decrypt(subAccount.account.encPassword, subAccount.account.passwordIv, subAccount.account.passwordTag);
        const newName = dto.name || this.crypto.decrypt(subAccount.encName, subAccount.nameIv, subAccount.nameTag);
        const newPin = dto.pin || this.crypto.decrypt(subAccount.encPin, subAccount.pinIv, subAccount.pinTag);
        const packageName = activeOrder.duration?.app?.template?.name ?? 'Akun';
        const msg = this.buildCredentialMessage(packageName, email, password, newName, newPin);
        await this.telegramService.bot.api.sendMessage(activeOrder.buyerTgUserId.toString(), msg);
      }
    } catch {
      // Silently ignore notification failures
    }

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
