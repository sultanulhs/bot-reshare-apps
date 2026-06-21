import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateDurationDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsInt()
  @Min(0)
  days!: number;

  @IsInt()
  @Min(0)
  basePrice!: number;

  @IsEnum(['AKUN_READY', 'MANUAL'])
  productType!: string;

  @IsOptional()
  @IsString()
  buyerInfoLabel?: string;

  @IsOptional()
  @IsInt()
  manualStock?: number | null;
}
