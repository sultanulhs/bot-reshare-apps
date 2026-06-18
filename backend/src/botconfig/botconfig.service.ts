import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBotConfigDto } from './dto/update-botconfig.dto';

@Injectable()
export class BotConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.botConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return {
      welcomeText: config.welcomeText,
      categories: JSON.parse(config.categories),
      featuresOn: JSON.parse(config.featuresOn),
    };
  }

  async updateConfig(dto: UpdateBotConfigDto) {
    const data: any = {};
    if (dto.welcomeText !== undefined) data.welcomeText = dto.welcomeText;
    if (dto.categories !== undefined) data.categories = JSON.stringify(dto.categories);
    if (dto.featuresOn !== undefined) data.featuresOn = JSON.stringify(dto.featuresOn);

    const config = await this.prisma.botConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    return {
      welcomeText: config.welcomeText,
      categories: JSON.parse(config.categories),
      featuresOn: JSON.parse(config.featuresOn),
    };
  }
}
