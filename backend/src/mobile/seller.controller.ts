import {
  Body,
  Controller,
  Delete,
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
import { CreateCategoryDto } from '../catalog/dto/create-category.dto';
import { CreateAppDto } from '../catalog/dto/create-app.dto';
import { CreateDurationDto } from '../catalog/dto/create-duration.dto';
import { UpdateCategoryDto } from '../catalog/dto/update-category.dto';
import { UpdateAppDto } from '../catalog/dto/update-app.dto';
import { UpdateDurationDto } from '../catalog/dto/update-duration.dto';
import { UpdateAccountDto } from '../stock/dto/update-account.dto';
import { UpdateSubAccountDto } from '../stock/dto/update-sub-account.dto';
import { AddAccountDto } from '../stock/dto/add-account.dto';
import { AddSubAccountDto } from '../stock/dto/add-sub-account.dto';
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

  // --- Category endpoints ---

  @Get('categories')
  async getCategories(@Req() req: any) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.getCategories(seller.id);
  }

  @Post('categories')
  @UseGuards(ActiveSellerGuard)
  async createCategory(@Req() req: any, @Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(req.seller.id, dto);
  }

  @Patch('categories/:id')
  @UseGuards(ActiveSellerGuard)
  async updateCategory(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalogService.updateCategory(req.seller.id, id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(ActiveSellerGuard)
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.catalogService.softDeleteCategory(req.seller.id, id);
  }

  // --- Template endpoints ---

  @Get('templates')
  async getTemplates(@Query('categoryId') categoryId: string) {
    return this.catalogService.getTemplates(categoryId);
  }

  // --- App endpoints ---

  @Get('apps')
  async getApps(@Req() req: any, @Query('categoryId') categoryId?: string) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.catalogService.getApps(seller.id, categoryId);
  }

  @Post('apps')
  @UseGuards(ActiveSellerGuard)
  async createApp(@Req() req: any, @Body() dto: CreateAppDto) {
    return this.catalogService.createApp(req.seller.id, dto);
  }

  @Get('apps/:id')
  async getAppDetail(@Req() req: any, @Param('id') id: string) {
    return this.catalogService.getAppWithStock(id);
  }

  @Patch('apps/:id')
  @UseGuards(ActiveSellerGuard)
  async updateApp(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAppDto) {
    return this.catalogService.updateApp(req.seller.id, id, dto);
  }

  @Delete('apps/:id')
  @UseGuards(ActiveSellerGuard)
  async deleteApp(@Req() req: any, @Param('id') id: string) {
    return this.catalogService.softDeleteApp(req.seller.id, id);
  }

  // --- Duration endpoints ---

  @Post('apps/:appId/durations')
  @UseGuards(ActiveSellerGuard)
  async createDuration(
    @Req() req: any,
    @Param('appId') appId: string,
    @Body() dto: CreateDurationDto,
  ) {
    return this.catalogService.createDuration(req.seller.id, appId, dto);
  }

  @Patch('durations/:id')
  @UseGuards(ActiveSellerGuard)
  async updateDuration(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDurationDto) {
    return this.catalogService.updateDuration(req.seller.id, id, dto);
  }

  @Delete('durations/:id')
  @UseGuards(ActiveSellerGuard)
  async deleteDuration(@Req() req: any, @Param('id') id: string) {
    return this.catalogService.softDeleteDuration(req.seller.id, id);
  }

  // --- Account/Stock endpoints ---

  @Post('durations/:durationId/accounts')
  @UseGuards(ActiveSellerGuard)
  addAccount(
    @Req() req: any,
    @Param('durationId') durationId: string,
    @Body() dto: AddAccountDto,
  ) {
    return this.stockService.addAccount(req.seller.id, durationId, dto);
  }

  @Get('durations/:durationId/accounts')
  async listAccounts(
    @Req() req: any,
    @Param('durationId') durationId: string,
  ) {
    const seller = await this.sellerService.getStatus(req.user.sub);
    return this.stockService.listAccounts(seller.id, durationId);
  }

  @Patch('accounts/:id')
  @UseGuards(ActiveSellerGuard)
  async updateAccount(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.stockService.updateAccount(req.seller.id, id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(ActiveSellerGuard)
  async deleteAccount(@Req() req: any, @Param('id') id: string) {
    return this.stockService.softDeleteAccount(req.seller.id, id);
  }

  @Post('accounts/:accountId/sub-accounts')
  @UseGuards(ActiveSellerGuard)
  addSubAccount(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() dto: AddSubAccountDto,
  ) {
    return this.stockService.addSubAccount(req.seller.id, accountId, dto);
  }

  @Get('accounts/:accountId/sub-accounts')
  async listSubAccounts(@Param('accountId') accountId: string) {
    return this.stockService.listSubAccounts(accountId);
  }

  @Patch('sub-accounts/:id')
  @UseGuards(ActiveSellerGuard)
  async updateSubAccount(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSubAccountDto) {
    return this.stockService.updateSubAccount(req.seller.id, id, dto);
  }

  @Delete('sub-accounts/:id')
  @UseGuards(ActiveSellerGuard)
  async deleteSubAccount(@Req() req: any, @Param('id') id: string) {
    return this.stockService.softDeleteSubAccount(req.seller.id, id);
  }

  // --- Balance/Sales ---

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

  // --- Order fulfillment ---

  @Get('expired-accounts')
  @UseGuards(ActiveSellerGuard)
  async getExpiredAccounts(@Req() req: any) {
    return this.orderService.getExpiredAccounts(req.seller.id);
  }

  @Get('pending-orders')
  @UseGuards(ActiveSellerGuard)
  getPendingOrders(@Req() req: any) {
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

  // --- Verification ---

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
    const result = await this.subscriptionService.checkout(seller.id, dto.planId);
    return {
      qrContent: result.qrContent,
      qrImageBase64: result.qrImage.toString('base64'),
      partnerReferenceNo: result.partnerReferenceNo,
    };
  }
}
