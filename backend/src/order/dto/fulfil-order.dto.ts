import { IsString, MinLength } from 'class-validator';

export class FulfilOrderDto {
  @IsString()
  @MinLength(1)
  credentials!: string;
}
