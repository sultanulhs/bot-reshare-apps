-- CreateTable
CREATE TABLE "LoginReport" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LoginReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginReport_orderId_idx" ON "LoginReport"("orderId");

-- AddForeignKey
ALTER TABLE "LoginReport" ADD CONSTRAINT "LoginReport_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
