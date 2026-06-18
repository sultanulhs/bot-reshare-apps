import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CreateQrisParams {
  partnerReferenceNo: string;
  amount: number;
  title: string;
}

interface QrisResult {
  qrContent: string;
  danaReferenceNo: string;
}

@Injectable()
export class DanaService {
  private readonly logger = new Logger(DanaService.name);

  constructor(private readonly config: ConfigService) {}

  async createQrisOrder(params: CreateQrisParams): Promise<QrisResult> {
    const env = this.config.get<string>('DANA_ENV');

    if (env === 'sandbox') {
      this.logger.warn(
        `[SANDBOX] Mock QRIS order: ${params.partnerReferenceNo} amount=${params.amount}`,
      );
      return {
        qrContent: `MOCK_QRIS_${params.partnerReferenceNo}_${params.amount}`,
        danaReferenceNo: `DANA_${Date.now()}`,
      };
    }

    throw new Error('Production DANA integration not implemented yet');
  }
}
