import { IsString, MinLength, IsOptional } from 'class-validator';

export class CreateAppDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
