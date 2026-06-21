import { Module, forwardRef } from '@nestjs/common';
import { StockService } from './stock.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [forwardRef(() => TelegramModule)],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
