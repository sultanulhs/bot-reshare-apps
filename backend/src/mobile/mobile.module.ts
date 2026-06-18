import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { SellerModule } from '../seller/seller.module';
import { CatalogModule } from '../catalog/catalog.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [SellerModule, CatalogModule, StockModule],
  controllers: [SellerController],
})
export class MobileModule {}
