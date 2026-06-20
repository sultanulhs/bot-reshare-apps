-- Make orderId optional (nullable) for subscription fee entries
ALTER TABLE "LedgerEntry" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "LedgerEntry" DROP CONSTRAINT IF EXISTS "LedgerEntry_orderId_fkey";
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add subscriptionId column
ALTER TABLE "LedgerEntry" ADD COLUMN "subscriptionId" TEXT;
