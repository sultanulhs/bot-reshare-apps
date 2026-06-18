import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';
import { KeyProvider } from './key-provider';
import { randomBytes } from 'node:crypto';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const testKey = randomBytes(32);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: KeyProvider,
          useValue: { getKey: () => testKey },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it('should encrypt and decrypt a string (round-trip)', () => {
    const plaintext = 'user@example.com:P@ssw0rd123';
    const encrypted = service.encrypt(plaintext);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(plaintext);

    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (unique IV)', () => {
    const plaintext = 'same-input';
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = service.encrypt('secret');
    const tampered =
      encrypted.ciphertext.slice(0, -2) +
      (encrypted.ciphertext.endsWith('aa') ? 'bb' : 'aa');

    expect(() =>
      service.decrypt(tampered, encrypted.iv, encrypted.authTag),
    ).toThrow();
  });

  it('should throw on wrong authTag', () => {
    const encrypted = service.encrypt('secret');
    const wrongTag = Buffer.alloc(16).toString('hex');

    expect(() =>
      service.decrypt(encrypted.ciphertext, encrypted.iv, wrongTag),
    ).toThrow();
  });

  it('should handle empty string', () => {
    const encrypted = service.encrypt('');
    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe('');
  });

  it('should handle unicode content', () => {
    const plaintext = 'Kredensial: юзер@тест.com / パスワード';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
    );
    expect(decrypted).toBe(plaintext);
  });
});
