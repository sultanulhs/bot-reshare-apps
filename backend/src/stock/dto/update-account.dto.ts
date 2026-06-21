import { IsOptional, IsString } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() password?: string;
}
