import { IsString, MinLength } from 'class-validator';

export class AddSubAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  pin!: string;
}
