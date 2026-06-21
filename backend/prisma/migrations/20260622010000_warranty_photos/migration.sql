-- CreateTable
CREATE TABLE "WarrantyPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WarrantyPhoto" ADD CONSTRAINT "WarrantyPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WarrantyPhoto_orderId_idx" ON "WarrantyPhoto"("orderId");
