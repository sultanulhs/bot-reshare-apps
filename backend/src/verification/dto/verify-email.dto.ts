import { IsJWT, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsJWT()
  verifyToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResendEmailOtpDto {
  @IsJWT()
  verifyToken!: string;
}

export class StartPhoneVerificationDto {
  @IsJWT()
  verifyToken!: string;
}

export class VerifyPhoneDto {
  @IsJWT()
  verifyToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class VerifySubscriptionDto {
  @IsJWT()
  verifyToken!: string;

  @IsString()
  planId!: string;
}
