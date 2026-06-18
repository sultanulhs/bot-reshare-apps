import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { SellerModule } from '../seller/seller.module';
import { CatalogModule } from '../catalog/catalog.module';
import { StockModule } from '../stock/stock.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [SellerModule, CatalogModule, StockModule, LedgerModule],
  controllers: [SellerController],
})
export class MobileModule {}
