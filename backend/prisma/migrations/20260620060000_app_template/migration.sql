-- Create AppTemplate table
CREATE TABLE "AppTemplate" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppTemplate_name_categoryId_key" ON "AppTemplate"("name", "categoryId");
ALTER TABLE "AppTemplate" ADD CONSTRAINT "AppTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppTemplate" ADD CONSTRAINT "AppTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing App data: create templates from existing apps
INSERT INTO "AppTemplate" ("id", "categoryId", "name", "isDefault", "createdAt")
SELECT "id", "categoryId", "name", false, "createdAt" FROM "App";

-- Add templateId to App, drop name/description/categoryId
ALTER TABLE "App" ADD COLUMN "templateId" TEXT;
ALTER TABLE "App" RENAME COLUMN "description" TO "notes";
UPDATE "App" SET "templateId" = "id";
ALTER TABLE "App" ALTER COLUMN "templateId" SET NOT NULL;
ALTER TABLE "App" DROP CONSTRAINT IF EXISTS "App_categoryId_fkey";
ALTER TABLE "App" DROP COLUMN "name";
ALTER TABLE "App" DROP COLUMN "categoryId";
ALTER TABLE "App" ADD CONSTRAINT "App_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "App_templateId_sellerId_key" ON "App"("templateId", "sellerId");

-- Seed default AppTemplates
INSERT INTO "AppTemplate" ("id", "categoryId", "name", "isDefault", "createdAt") VALUES
-- Streaming
('tpl_netflix', 'cat_streaming', 'Netflix', true, NOW()),
('tpl_spotify', 'cat_streaming', 'Spotify', true, NOW()),
('tpl_disney', 'cat_streaming', 'Disney+', true, NOW()),
('tpl_ytpremium', 'cat_streaming', 'YouTube Premium', true, NOW()),
('tpl_hbomax', 'cat_streaming', 'HBO Max', true, NOW()),
('tpl_appletv', 'cat_streaming', 'Apple TV+', true, NOW()),
('tpl_viu', 'cat_streaming', 'Viu', true, NOW()),
-- Produktivitas
('tpl_ms365', 'cat_produktivitas', 'Microsoft 365', true, NOW()),
('tpl_gworkspace', 'cat_produktivitas', 'Google Workspace', true, NOW()),
('tpl_canva', 'cat_produktivitas', 'Canva Pro', true, NOW()),
('tpl_adobe', 'cat_produktivitas', 'Adobe Creative Cloud', true, NOW()),
('tpl_notion', 'cat_produktivitas', 'Notion', true, NOW()),
('tpl_zoom', 'cat_produktivitas', 'Zoom', true, NOW()),
-- Gaming
('tpl_steam', 'cat_gaming', 'Steam', true, NOW()),
('tpl_psplus', 'cat_gaming', 'PlayStation Plus', true, NOW()),
('tpl_xboxgp', 'cat_gaming', 'Xbox Game Pass', true, NOW()),
('tpl_nintendo', 'cat_gaming', 'Nintendo Online', true, NOW()),
('tpl_eaplay', 'cat_gaming', 'EA Play', true, NOW()),
('tpl_roblox', 'cat_gaming', 'Roblox', true, NOW()),
-- VPN & Security
('tpl_nordvpn', 'cat_vpn', 'NordVPN', true, NOW()),
('tpl_expressvpn', 'cat_vpn', 'ExpressVPN', true, NOW()),
('tpl_surfshark', 'cat_vpn', 'Surfshark', true, NOW()),
('tpl_cyberghost', 'cat_vpn', 'CyberGhost', true, NOW()),
('tpl_kaspersky', 'cat_vpn', 'Kaspersky', true, NOW()),
('tpl_norton', 'cat_vpn', 'Norton', true, NOW()),
-- Edukasi
('tpl_coursera', 'cat_edukasi', 'Coursera', true, NOW()),
('tpl_udemy', 'cat_edukasi', 'Udemy', true, NOW()),
('tpl_skillshare', 'cat_edukasi', 'Skillshare', true, NOW()),
('tpl_duolingo', 'cat_edukasi', 'Duolingo Plus', true, NOW()),
('tpl_grammarly', 'cat_edukasi', 'Grammarly Premium', true, NOW()),
('tpl_ruangguru', 'cat_edukasi', 'Ruangguru', true, NOW()),
-- Sosial Media
('tpl_xpremium', 'cat_sosmed', 'Twitter/X Premium', true, NOW()),
('tpl_linkedin', 'cat_sosmed', 'LinkedIn Premium', true, NOW()),
('tpl_tgpremium', 'cat_sosmed', 'Telegram Premium', true, NOW()),
('tpl_tiktok', 'cat_sosmed', 'TikTok Premium', true, NOW())
ON CONFLICT DO NOTHING;
