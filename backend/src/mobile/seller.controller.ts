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
import { LedgerService } from '../ledger/ledger.service';
import { SubmitProfileDto } from '../seller/dto/submit-profile.dto';
import { SetStoreCodeDto } from '../seller/dto/set-store-code.dto';
import { CreateProductDto } from '../catalog/dto/create-product.dto';
import { UpdateProductDto } from '../catalog/dto/update-product.dto';
import { AddStockDto } from '../stock/dto/add-stock.dto';
import { OrderService } from '../order/order.service';
import { FulfilOrderDto } from '../order/dto/fulfil-order.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { CheckoutDto } from '../subscription/dto/checkout.dto';
import { VerificationService } from '../verification/verification.service';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SELLER)
export class SellerController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly catalogService: CatalogService,
    private readonly stockService: StockService,
    private readonly ledgerService: LedgerService,
    private readonly orderService: OrderService,
    private readonly subscriptionService: SubscriptionService,
    private readonly verificationService: VerificationService,
  ) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Get('status')
  getStatus(@Req() req: any) {
    return this.sellerService.getStatus(req.user.sub);
  }

  @Get('store-link')
  getStoreLink(@Req() req: any) {
    return this.sellerService.getStoreLink(req.user.sub);
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

  @Get('balance')
  async getBalance(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.ledgerService.getBalance(seller.id);
  }

  @Get('sales')
  async getSales(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.ledgerService.getSales(seller.id);
  }

  @Get('pending-fulfillments')
  @UseGuards(ActiveSellerGuard)
  getPendingFulfillments(@Req() req: any) {
    return this.orderService.getSellerPendingFulfillments(req.seller.id);
  }

  @Post('orders/:id/fulfill')
  @UseGuards(ActiveSellerGuard)
  fulfilOrder(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: FulfilOrderDto,
  ) {
    return this.orderService.fulfilOnDemand(req.seller.id, id, dto.credentials);
  }

  @Post('verify/email/send')
  async sendEmailOtp(@Req() req: any) {
    await this.verificationService.generateEmailOtp(req.user.sub);
    return { message: 'Kode OTP telah dikirim ke email Anda' };
  }

  @Post('verify/email')
  async verifyEmail(@Req() req: any, @Body() body: { code: string }) {
    await this.verificationService.verifyEmailOtp(req.user.sub, body.code);
    return { message: 'Email berhasil diverifikasi' };
  }

  @Post('verify/phone/start')
  async startPhoneVerification(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    const { deepLink } = await this.verificationService.startPhoneVerification(seller.id);
    return { deepLink };
  }

  @Post('verify/phone')
  async verifyPhone(@Req() req: any, @Body() body: { code: string }) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    await this.verificationService.verifyPhoneOtp(seller.id, body.code);
    return { message: 'Nomor telepon berhasil diverifikasi' };
  }

  @Post('store-code')
  setStoreCode(@Req() req: any, @Body() dto: SetStoreCodeDto) {
    return this.sellerService.setStoreCode(req.user.sub, dto.storeCode);
  }

  @Get('subscription')
  async getSubscription(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    const sub = await this.subscriptionService.getSellerSubscription(seller.id);
    return sub ?? { status: 'NONE', message: 'Tidak ada langganan aktif' };
  }

  @Post('subscription/checkout')
  async subscriptionCheckout(@Req() req: any, @Body() dto: CheckoutDto) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.subscriptionService.checkout(seller.id, dto.planId);
  }
}
