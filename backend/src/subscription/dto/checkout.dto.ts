import { IsString } from 'class-validator';

export class CheckoutDto {
  @IsString()
  planId!: string;
}
