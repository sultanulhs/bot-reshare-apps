import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { MobileModule } from './mobile/mobile.module';
import { TelegramModule } from './telegram/telegram.module';
import { OrderModule } from './order/order.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    QueueModule,
    CryptoModule,
    AuthModule,
    MobileModule,
    TelegramModule,
    OrderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
