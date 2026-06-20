import { Inject, Injectable, Logger, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfigService } from '../botconfig/botconfig.service';
import { CatalogService } from '../catalog/catalog.service';
import { OrderService } from '../order/order.service';
import { createBuyerComposer } from './composers/buyer.composer';
import { createSellerVerifyComposer } from './composers/seller-verify.composer';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot<Context>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly botConfigService: BotConfigService,
    private readonly catalogService: CatalogService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    this.bot = new Bot<Context>(token);
  }

  async onModuleInit() {
    // Register seller-verify composer first so it handles verify_ payloads before buyer
    const sellerVerifyComposer = createSellerVerifyComposer(
      this.prisma,
      this.verificationService,
    );
    this.bot.use(sellerVerifyComposer);

    const buyerComposer = createBuyerComposer(
      this.prisma,
      this.botConfigService,
      this.catalogService,
      this.orderService,
    );
    this.bot.use(buyerComposer);

    this.bot.catch((err) => {
      this.logger.error('Bot error:', err.message);
    });

    this.bot.start({
      onStart: () => this.logger.log('Telegram bot started'),
    });
  }
}
