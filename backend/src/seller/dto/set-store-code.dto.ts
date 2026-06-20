import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class SetStoreCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Kode toko hanya boleh huruf, angka, _ dan -',
  })
  storeCode!: string;
}
