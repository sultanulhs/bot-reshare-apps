-- CreateTable
CREATE TABLE "LoginReportPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginReportPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoginReportPhoto" ADD CONSTRAINT "LoginReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "LoginReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "LoginReportPhoto_reportId_idx" ON "LoginReportPhoto"("reportId");

-- Migrate existing data: move photoId to LoginReportPhoto
INSERT INTO "LoginReportPhoto" ("id", "reportId", "fileId", "createdAt")
SELECT gen_random_uuid()::text, "id", "photoId", "createdAt" FROM "LoginReport" WHERE "photoId" IS NOT NULL;

-- DropColumn
ALTER TABLE "LoginReport" DROP COLUMN "photoId";
