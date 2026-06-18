import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfigService } from '../botconfig/botconfig.service';
import { CatalogService } from '../catalog/catalog.service';
import { OrderService } from '../order/order.service';
import { createBuyerComposer } from './composers/buyer.composer';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot<Context>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly botConfigService: BotConfigService,
    private readonly catalogService: CatalogService,
    private readonly orderService: OrderService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    this.bot = new Bot<Context>(token);
  }

  async onModuleInit() {
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
