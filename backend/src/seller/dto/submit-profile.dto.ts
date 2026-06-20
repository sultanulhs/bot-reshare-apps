import { IsString, MinLength } from 'class-validator';

export class SubmitProfileDto {
  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsString()
  @MinLength(1)
  accountNumber!: string;

  @IsString()
  @MinLength(1)
  accountHolder!: string;
}
