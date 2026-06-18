import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeyProvider {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const b64 = config.get<string>('CREDENTIAL_ENC_KEY');
    if (!b64) {
      throw new Error('CREDENTIAL_ENC_KEY is not set');
    }
    this.key = Buffer.from(b64, 'base64');
    if (this.key.length !== 32) {
      throw new Error(
        `CREDENTIAL_ENC_KEY must decode to 32 bytes, got ${this.key.length}`,
      );
    }
  }

  getKey(): Buffer {
    return this.key;
  }
}
