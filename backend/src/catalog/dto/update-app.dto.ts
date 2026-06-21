import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAppDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() name?: string;
}
