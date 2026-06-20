-- Rename Seller.name to Seller.ownerName
ALTER TABLE "Seller" RENAME COLUMN "name" TO "ownerName";

-- Add storeName (default to ownerName for existing rows)
ALTER TABLE "Seller" ADD COLUMN "storeName" TEXT NOT NULL DEFAULT '';
UPDATE "Seller" SET "storeName" = "ownerName" WHERE "storeName" = '';
ALTER TABLE "Seller" ALTER COLUMN "storeName" DROP DEFAULT;

-- Add phone verification fields
ALTER TABLE "Seller" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Seller" ADD COLUMN "tgUserId" BIGINT;
CREATE UNIQUE INDEX "Seller_tgUserId_key" ON "Seller"("tgUserId");

-- Add email verification to User
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Create OtpChannel enum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'PHONE');

-- Create Otp table
CREATE TABLE "Otp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Otp_userId_channel_idx" ON "Otp"("userId", "channel");
ALTER TABLE "Otp" ADD CONSTRAINT "Otp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create TelegramVerification table
CREATE TABLE "TelegramVerification" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tgUserId" BIGINT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramVerification_sellerId_key" ON "TelegramVerification"("sellerId");
CREATE UNIQUE INDEX "TelegramVerification_token_key" ON "TelegramVerification"("token");
ALTER TABLE "TelegramVerification" ADD CONSTRAINT "TelegramVerification_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
