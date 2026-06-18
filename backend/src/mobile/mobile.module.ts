import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { AdminController } from './admin.controller';
import { SellerModule } from '../seller/seller.module';
import { CatalogModule } from '../catalog/catalog.module';
import { StockModule } from '../stock/stock.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MarkupModule } from '../markup/markup.module';
import { BotConfigModule } from '../botconfig/botconfig.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AdminStatsModule } from '../admin/admin-stats.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    SellerModule,
    CatalogModule,
    StockModule,
    LedgerModule,
    MarkupModule,
    BotConfigModule,
    SubscriptionModule,
    AdminStatsModule,
    OrderModule,
  ],
  controllers: [SellerController, AdminController],
})
export class MobileModule {}
