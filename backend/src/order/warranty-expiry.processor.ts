import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrderService } from './order.service';

@Processor('warranty-expiry')
export class WarrantyExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(WarrantyExpiryProcessor.name);

  constructor(private readonly orderService: OrderService) {
    super();
  }

  async process(job: Job<{ orderId: string }>) {
    this.logger.log(`Expiring warranty for order ${job.data.orderId}`);
    await this.orderService.expireWarranty(job.data.orderId);
  }
}
