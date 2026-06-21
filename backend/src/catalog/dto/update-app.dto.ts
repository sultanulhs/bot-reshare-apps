import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAppDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string;
}
