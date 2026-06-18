import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateBotConfigDto {
  @IsOptional()
  @IsString()
  welcomeText?: string;

  @IsOptional()
  @IsArray()
  categories?: string[];

  @IsOptional()
  @IsObject()
  featuresOn?: Record<string, boolean>;
}
