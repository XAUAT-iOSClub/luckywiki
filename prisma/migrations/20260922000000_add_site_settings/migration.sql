-- CreateTable (for fresh databases)
CREATE TABLE IF NOT EXISTS "site_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "site_name" TEXT NOT NULL DEFAULT 'LuckyWiki',
    "description" TEXT,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "footer_copyright" TEXT,
    "footer_icp" TEXT,
    "agent_api_key" TEXT,
    "agent_api_base_url" TEXT,
    "agent_chat_model" TEXT,
    "agent_embed_model" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- Add agent columns (for existing databases where site_settings already exists)
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "agent_api_key" TEXT;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "agent_api_base_url" TEXT;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "agent_chat_model" TEXT;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "agent_embed_model" TEXT;

-- Insert default row if not exists
INSERT INTO "site_settings" ("id") VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
