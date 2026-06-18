import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { KeyProvider } from './key-provider';

@Global()
@Module({
  providers: [KeyProvider, CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
