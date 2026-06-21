import { IsOptional, IsString } from 'class-validator';

export class UpdateAppDto {
  @IsOptional() @IsString() notes?: string;
}
