import { Module } from '@nestjs/common';
import { SellerService } from './seller.service';
import { AdminSellerService } from './admin-seller.service';

@Module({
  providers: [SellerService, AdminSellerService],
  exports: [SellerService, AdminSellerService],
})
export class SellerModule {}
