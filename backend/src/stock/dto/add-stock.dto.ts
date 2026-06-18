import { IsString, MinLength } from 'class-validator';

export class AddStockDto {
  @IsString()
  @MinLength(1)
  credentials!: string;
}
