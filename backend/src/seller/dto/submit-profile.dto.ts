import { IsString, MinLength } from 'class-validator';

export class SubmitProfileDto {
  @IsString()
  @MinLength(1)
  payoutAccount!: string;
}
