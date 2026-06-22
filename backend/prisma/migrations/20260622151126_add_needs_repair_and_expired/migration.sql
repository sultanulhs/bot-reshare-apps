-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockStatus" ADD VALUE 'NEEDS_REPAIR';
ALTER TYPE "StockStatus" ADD VALUE 'EXPIRED';

-- DropIndex
DROP INDEX "LoginReportPhoto_reportId_idx";

-- DropIndex
DROP INDEX "OrderMessage_orderId_idx";
