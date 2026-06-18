import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class PaymentService {
  async generateQrImage(qrContent: string): Promise<Buffer> {
    return QRCode.toBuffer(qrContent, {
      type: 'png',
      width: 300,
      margin: 2,
    });
  }
}
