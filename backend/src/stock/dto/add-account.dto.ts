import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class AddAccountDto {
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsBoolean()
  hasSubAccounts?: boolean;
}
