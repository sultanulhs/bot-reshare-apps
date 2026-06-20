-- Remove SUB_AKUN from ProductType enum
UPDATE "Duration" SET "productType" = 'AKUN_READY' WHERE "productType" = 'SUB_AKUN';
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
CREATE TYPE "ProductType" AS ENUM ('AKUN_READY', 'MANUAL');
ALTER TABLE "Duration" ALTER COLUMN "productType" DROP DEFAULT;
ALTER TABLE "Duration" ALTER COLUMN "productType" TYPE "ProductType" USING "productType"::text::"ProductType";
ALTER TABLE "Duration" ALTER COLUMN "productType" SET DEFAULT 'AKUN_READY';
DROP TYPE "ProductType_old";
