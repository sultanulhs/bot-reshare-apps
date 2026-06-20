import { IsString, MinLength } from 'class-validator';

export class AddAccountDto {
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
