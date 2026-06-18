import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot<Context>;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
    this.bot = new Bot<Context>(token);
  }

  async onModuleInit() {
    this.bot.catch((err) => {
      this.logger.error('Bot error:', err.message);
    });

    try {
      this.bot.start({
        onStart: () => this.logger.log('Telegram bot started'),
      });
    } catch (error) {
      this.logger.error(
        'Failed to start Telegram bot:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
