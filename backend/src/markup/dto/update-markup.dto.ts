import { IsEnum, IsInt, IsOptional } from 'class-validator';

enum MarkupModeDto {
  FIXED = 'FIXED',
  RANDOM = 'RANDOM',
}

export class UpdateMarkupDto {
  @IsEnum(MarkupModeDto)
  markupMode!: 'FIXED' | 'RANDOM';

  @IsOptional()
  @IsInt()
  markupValue?: number;

  @IsOptional()
  @IsInt()
  markupMin?: number;

  @IsOptional()
  @IsInt()
  markupMax?: number;
}
