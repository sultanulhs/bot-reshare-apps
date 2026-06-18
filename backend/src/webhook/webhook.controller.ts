import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FulfilmentService } from './fulfilment.service';

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly fulfilmentService: FulfilmentService) {}

  @Post('v1.0/debit/notify')
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('No raw body available');
      return { responseCode: '5000000', responseMessage: 'General Error' };
    }

    const body = JSON.parse(rawBody.toString('utf-8'));

    // TODO: In production, verify DANA signature against rawBody
    // For sandbox, skip signature verification
    this.logger.log(
      `Webhook received: partnerReferenceNo=${body.originalPartnerReferenceNo}`,
    );

    try {
      await this.fulfilmentService.handlePaymentNotification(body);
      return { responseCode: '2000000', responseMessage: 'Success' };
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { responseCode: '5000000', responseMessage: 'General Error' };
    }
  }
}
