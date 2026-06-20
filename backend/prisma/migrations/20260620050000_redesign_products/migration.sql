-- Drop foreign keys from Order that reference old tables
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_stockUnitId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_productId_fkey";

-- Drop old tables (order matters for FK)
DROP TABLE IF EXISTS "StockUnit";
DROP TABLE IF EXISTS "Product";

-- Drop old enum
DROP TYPE IF EXISTS "StockType";

-- Create new enum
CREATE TYPE "ProductType" AS ENUM ('AKUN_READY', 'SUB_AKUN', 'MANUAL');

-- Create Category table
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sellerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- Create App table
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- Create Duration table
CREATE TABLE "Duration" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "productType" "ProductType" NOT NULL DEFAULT 'AKUN_READY',
    "buyerInfoLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Duration_pkey" PRIMARY KEY ("id")
);

-- Create Account table
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "durationId" TEXT NOT NULL,
    "encEmail" TEXT NOT NULL,
    "emailIv" TEXT NOT NULL,
    "emailTag" TEXT NOT NULL,
    "encPassword" TEXT NOT NULL,
    "passwordIv" TEXT NOT NULL,
    "passwordTag" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- Create SubAccount table
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "encName" TEXT NOT NULL,
    "nameIv" TEXT NOT NULL,
    "nameTag" TEXT NOT NULL,
    "encPin" TEXT NOT NULL,
    "pinIv" TEXT NOT NULL,
    "pinTag" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubAccount_pkey" PRIMARY KEY ("id")
);

-- Alter Order table: drop old columns
DROP INDEX IF EXISTS "Order_stockUnitId_key";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "stockUnitId";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "productId";

-- Alter Order table: add new columns
ALTER TABLE "Order" ADD COLUMN "durationId" TEXT;
ALTER TABLE "Order" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Order" ADD COLUMN "subAccountId" TEXT;
ALTER TABLE "Order" ADD COLUMN "buyerInfo" TEXT;
ALTER TABLE "Order" ADD COLUMN "sellerNote" TEXT;

-- Add unique constraints on Order
CREATE UNIQUE INDEX "Order_accountId_key" ON "Order"("accountId");
CREATE UNIQUE INDEX "Order_subAccountId_key" ON "Order"("subAccountId");

-- Add unique constraint on Category
CREATE UNIQUE INDEX "Category_name_sellerId_key" ON "Category"("name", "sellerId");

-- Add foreign keys for Category
ALTER TABLE "Category" ADD CONSTRAINT "Category_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign keys for App
ALTER TABLE "App" ADD CONSTRAINT "App_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "App" ADD CONSTRAINT "App_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign keys for Duration
ALTER TABLE "Duration" ADD CONSTRAINT "Duration_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign keys for Account
ALTER TABLE "Account" ADD CONSTRAINT "Account_durationId_fkey" FOREIGN KEY ("durationId") REFERENCES "Duration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign keys for SubAccount
ALTER TABLE "SubAccount" ADD CONSTRAINT "SubAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign keys for Order new columns
ALTER TABLE "Order" ADD CONSTRAINT "Order_durationId_fkey" FOREIGN KEY ("durationId") REFERENCES "Duration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default categories
INSERT INTO "Category" ("id", "name", "icon", "isDefault", "createdAt") VALUES
  ('cat_streaming', 'Streaming', '🎬', true, NOW()),
  ('cat_produktivitas', 'Produktivitas', '💼', true, NOW()),
  ('cat_gaming', 'Gaming', '🎮', true, NOW()),
  ('cat_vpn', 'VPN & Security', '🔒', true, NOW()),
  ('cat_edukasi', 'Edukasi', '📚', true, NOW()),
  ('cat_sosmed', 'Sosial Media', '📱', true, NOW()),
  ('cat_lainnya', 'Lainnya', '📦', true, NOW());
