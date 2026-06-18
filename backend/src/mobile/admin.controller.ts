import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminSellerService } from '../seller/admin-seller.service';
import { MarkupService } from '../markup/markup.service';
import { BotConfigService } from '../botconfig/botconfig.service';
import { SubscriptionPlanService } from '../subscription/subscription-plan.service';
import { AdminStatsService } from '../admin/admin-stats.service';
import { UpdateMarkupDto } from '../markup/dto/update-markup.dto';
import { UpdateBotConfigDto } from '../botconfig/dto/update-botconfig.dto';
import { UpdatePlansDto } from '../subscription/dto/update-plans.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminSellerService: AdminSellerService,
    private readonly markupService: MarkupService,
    private readonly botConfigService: BotConfigService,
    private readonly subscriptionPlanService: SubscriptionPlanService,
    private readonly adminStatsService: AdminStatsService,
  ) {}

  @Get('sellers')
  listSellers(@Query('status') status?: string) {
    return this.adminSellerService.listSellers(status);
  }

  @Get('sellers/:id')
  getSellerDetail(@Param('id') id: string) {
    return this.adminSellerService.getSellerDetail(id);
  }

  @Post('sellers/:id/approve')
  approveSeller(@Param('id') id: string) {
    return this.adminSellerService.approveSeller(id);
  }

  @Post('sellers/:id/verify-profile')
  verifyProfile(@Param('id') id: string) {
    return this.adminSellerService.verifyProfile(id);
  }

  @Post('sellers/:id/reject')
  rejectSeller(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminSellerService.rejectSeller(id, reason);
  }

  @Post('sellers/:id/suspend')
  suspendSeller(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminSellerService.suspendSeller(id, reason);
  }

  @Get('markup')
  getMarkup() {
    return this.markupService.getConfig();
  }

  @Put('markup')
  updateMarkup(@Body() dto: UpdateMarkupDto) {
    return this.markupService.updateConfig(dto);
  }

  @Get('subscription-plans')
  getSubscriptionPlans() {
    return this.subscriptionPlanService.getPlans();
  }

  @Put('subscription-plans')
  updateSubscriptionPlans(@Body() dto: UpdatePlansDto) {
    return this.subscriptionPlanService.updatePlans(dto);
  }

  @Get('botconfig')
  getBotConfig() {
    return this.botConfigService.getConfig();
  }

  @Put('botconfig')
  updateBotConfig(@Body() dto: UpdateBotConfigDto) {
    return this.botConfigService.updateConfig(dto);
  }

  @Get('stats')
  getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminStatsService.getStats(from, to);
  }

  @Get('orders')
  getOrders(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminStatsService.getOrders({
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
