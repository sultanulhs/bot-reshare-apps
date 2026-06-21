import { IsOptional, IsString } from 'class-validator';

export class UpdateSubAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() pin?: string;
}
