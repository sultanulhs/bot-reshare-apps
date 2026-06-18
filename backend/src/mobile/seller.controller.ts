import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveSellerGuard } from '../seller/guards/active-seller.guard';
import { SellerService } from '../seller/seller.service';
import { CatalogService } from '../catalog/catalog.service';
import { StockService } from '../stock/stock.service';
import { SubmitProfileDto } from '../seller/dto/submit-profile.dto';
import { CreateProductDto } from '../catalog/dto/create-product.dto';
import { UpdateProductDto } from '../catalog/dto/update-product.dto';
import { AddStockDto } from '../stock/dto/add-stock.dto';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SELLER)
export class SellerController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly catalogService: CatalogService,
    private readonly stockService: StockService,
  ) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Get('status')
  getStatus(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Post('profile')
  submitProfile(@Req() req: any, @Body() dto: SubmitProfileDto) {
    return this.sellerService.submitProfile(req.user.sub, dto);
  }

  @Get('products')
  async listProducts(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.listProducts(seller.id);
  }

  @Post('products')
  @UseGuards(ActiveSellerGuard)
  async createProduct(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(req.seller.id, dto);
  }

  @Patch('products/:id')
  async updateProduct(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.updateProduct(seller.id, id, dto);
  }

  @Post('products/:id/stock')
  @UseGuards(ActiveSellerGuard)
  addStock(@Req() req: any, @Param('id') id: string, @Body() dto: AddStockDto) {
    return this.stockService.addStock(req.seller.id, id, dto);
  }

  @Get('stock')
  async listStock(
    @Req() req: any,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
  ) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.stockService.listStock(seller.id, { productId, status });
  }
}
