import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AddStockDto } from './dto/add-stock.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async addStock(sellerId: string, productId: string, dto: AddStockDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const encrypted = this.crypto.encrypt(dto.credentials);

    const unit = await this.prisma.stockUnit.create({
      data: {
        productId,
        encCredentials: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        status: 'AVAILABLE',
      },
    });

    return { stockUnitId: unit.id, status: unit.status };
  }

  async listStock(sellerId: string, query: { productId?: string; status?: string }) {
    const where: any = {
      product: { sellerId },
    };
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;

    const units = await this.prisma.stockUnit.findMany({
      where,
      select: {
        id: true,
        productId: true,
        status: true,
        createdAt: true,
      },
    });

    return units;
  }
}
