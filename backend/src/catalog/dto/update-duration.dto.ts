import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDurationDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsInt() @Min(0) days?: number;
  @IsOptional() @IsInt() @Min(0) basePrice?: number;
  @IsOptional() @IsEnum(['AKUN_READY', 'MANUAL']) productType?: string;
  @IsOptional() @IsString() buyerInfoLabel?: string;
  @IsOptional() manualStock?: number | null;
}
