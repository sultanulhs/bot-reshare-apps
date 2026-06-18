import { Test, TestingModule } from '@nestjs/testing';
import { MarkupService } from './markup.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('MarkupService', () => {
  let service: MarkupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      markupConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarkupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MarkupService>(MarkupService);
  });

  describe('computeMarkup', () => {
    it('should return fixedValue for FIXED mode', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue({
        mode: 'FIXED',
        fixedValue: 500,
        randomMin: 0,
        randomMax: 0,
      });

      const result = await service.computeMarkup();
      expect(result).toBe(500);
    });

    it('should return value in range for RANDOM mode', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue({
        mode: 'RANDOM',
        fixedValue: 0,
        randomMin: 100,
        randomMax: 500,
      });

      const result = await service.computeMarkup();
      expect(result).toBeGreaterThanOrEqual(100);
      expect(result).toBeLessThanOrEqual(500);
    });

    it('should return 0 if no config exists', async () => {
      prisma.markupConfig.findUnique.mockResolvedValue(null);
      const result = await service.computeMarkup();
      expect(result).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should validate FIXED mode requires markupValue >= 0', async () => {
      prisma.markupConfig.upsert.mockResolvedValue({
        mode: 'FIXED',
        fixedValue: 200,
        randomMin: 0,
        randomMax: 0,
      });

      const result = await service.updateConfig({
        markupMode: 'FIXED',
        markupValue: 200,
      });
      expect(result.mode).toBe('FIXED');
    });

    it('should validate RANDOM mode requires markupMin <= markupMax', async () => {
      await expect(
        service.updateConfig({
          markupMode: 'RANDOM',
          markupMin: 500,
          markupMax: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate all values >= 0', async () => {
      await expect(
        service.updateConfig({
          markupMode: 'FIXED',
          markupValue: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
