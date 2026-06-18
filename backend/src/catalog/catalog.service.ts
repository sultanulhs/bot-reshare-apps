import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(sellerId: string) {
    const products = await this.prisma.product.findMany({
      where: { sellerId },
      include: { stockUnits: { select: { status: true } } },
    });

    return products.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      basePrice: p.basePrice,
      active: p.active,
      stockType: p.stockType,
      stockCount: {
        available: p.stockUnits.filter((s) => s.status === 'AVAILABLE').length,
        locked: p.stockUnits.filter((s) => s.status === 'LOCKED').length,
        sold: p.stockUnits.filter((s) => s.status === 'SOLD').length,
      },
    }));
  }

  async createProduct(sellerId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        sellerId,
        category: dto.category,
        title: dto.title,
        basePrice: dto.basePrice,
      },
    });
  }

  async updateProduct(sellerId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
    });
  }
}
