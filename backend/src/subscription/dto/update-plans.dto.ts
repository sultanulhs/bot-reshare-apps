import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class PlanItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(1)
  periodDays!: number;

  @IsBoolean()
  active!: boolean;
}

export class UpdatePlansDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  plans!: PlanItemDto[];
}
