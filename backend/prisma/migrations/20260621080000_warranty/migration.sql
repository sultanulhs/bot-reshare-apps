ALTER TABLE "Seller" ADD COLUMN "warrantyHours" INT;
ALTER TABLE "Order" ADD COLUMN "warrantyStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "warrantyPhoto" TEXT;
ALTER TABLE "Order" ADD COLUMN "warrantyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "warrantyDeadline" TIMESTAMP(3);
