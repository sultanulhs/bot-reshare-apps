import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  async handlePaymentNotification(body: any) {
    this.logger.log('Payment notification received — fulfilment pending implementation');
  }
}
