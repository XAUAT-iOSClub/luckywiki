-- DropTable
-- site_settings 已废弃：站点元数据由 SITE_* 环境变量提供（lib/site.ts），
-- Agent 配置由 OPENAI_* 环境变量提供（lib/agent/openai.ts）。
DROP TABLE IF EXISTS "site_settings";
