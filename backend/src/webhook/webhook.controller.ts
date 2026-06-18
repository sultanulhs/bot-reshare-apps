import {
  Controller,
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
      this.logger.error('Missing raw body in webhook request');
      return {
        responseCode: '5000000',
        responseMessage: 'General Error',
      };
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      this.logger.error('Invalid JSON in webhook body');
      return {
        responseCode: '5000000',
        responseMessage: 'Invalid Request Format',
      };
    }

    if (!body.originalPartnerReferenceNo) {
      this.logger.error('Missing originalPartnerReferenceNo in webhook');
      return {
        responseCode: '4000000',
        responseMessage: 'Bad Request',
      };
    }

    try {
      await this.fulfilmentService.handlePaymentNotification(body);
      return {
        responseCode: '2000000',
        responseMessage: 'Success',
      };
    } catch (err: any) {
      this.logger.error(
        `Webhook error for ${body.originalPartnerReferenceNo}: ${err.message}`,
      );
      return {
        responseCode: '5000000',
        responseMessage: 'General Error',
      };
    }
  }
}
