import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsInt()
  @Min(0)
  basePrice!: number;
}
