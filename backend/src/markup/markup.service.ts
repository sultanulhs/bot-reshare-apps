import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMarkupDto } from './dto/update-markup.dto';

@Injectable()
export class MarkupService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.markupConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) {
      return {
        markupMode: 'FIXED' as const,
        markupValue: 0,
        markupMin: 0,
        markupMax: 0,
      };
    }
    return {
      markupMode: config.mode,
      markupValue: config.fixedValue,
      markupMin: config.randomMin,
      markupMax: config.randomMax,
    };
  }

  async updateConfig(dto: UpdateMarkupDto) {
    if (dto.markupMode === 'FIXED') {
      const val = dto.markupValue ?? 0;
      if (val < 0) throw new BadRequestException('markupValue must be >= 0');

      return this.prisma.markupConfig.upsert({
        where: { id: 'singleton' },
        update: { mode: 'FIXED', fixedValue: val },
        create: { id: 'singleton', mode: 'FIXED', fixedValue: val },
      });
    }

    const min = dto.markupMin ?? 0;
    const max = dto.markupMax ?? 0;
    if (min < 0 || max < 0) {
      throw new BadRequestException('markupMin and markupMax must be >= 0');
    }
    if (min > max) {
      throw new BadRequestException('markupMin must be <= markupMax');
    }

    return this.prisma.markupConfig.upsert({
      where: { id: 'singleton' },
      update: { mode: 'RANDOM', randomMin: min, randomMax: max },
      create: { id: 'singleton', mode: 'RANDOM', randomMin: min, randomMax: max },
    });
  }

  async computeMarkup(): Promise<number> {
    const config = await this.prisma.markupConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) return 0;

    if (config.mode === 'FIXED') {
      return config.fixedValue;
    }

    const range = config.randomMax - config.randomMin;
    return config.randomMin + Math.floor(Math.random() * (range + 1));
  }
}
