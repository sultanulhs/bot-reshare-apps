import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrderService } from './order.service';

@Processor('order-expiry')
export class OrderExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(private readonly orderService: OrderService) {
    super();
  }

  async process(job: Job<{ orderId?: string }>) {
    if (job.name === 'scan-access-expiry') {
      this.logger.log('Scanning for expired access stock');
      await this.orderService.expireAccessStock();
    } else {
      this.logger.log(`Expiring order ${job.data.orderId}`);
      await this.orderService.expireOrder(job.data.orderId!);
    }
  }
}
