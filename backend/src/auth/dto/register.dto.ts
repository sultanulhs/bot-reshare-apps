import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  ownerName!: string;

  @IsString()
  @MinLength(1)
  storeName!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @IsOptional()
  planId?: string;
}
