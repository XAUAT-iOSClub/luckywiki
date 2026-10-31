-- Webhook 出站通知：配置表
CREATE TABLE "webhook_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_configs_user_id_idx" ON "webhook_configs"("user_id");
CREATE INDEX "webhook_configs_active_idx" ON "webhook_configs"("active");

ALTER TABLE "webhook_configs"
    ADD CONSTRAINT "webhook_configs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Webhook 投递日志
CREATE TABLE "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_code" INTEGER,
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_delivery_logs_webhook_id_idx" ON "webhook_delivery_logs"("webhook_id");
CREATE INDEX "webhook_delivery_logs_event_idx" ON "webhook_delivery_logs"("event");
CREATE INDEX "webhook_delivery_logs_created_at_idx" ON "webhook_delivery_logs"("created_at");

ALTER TABLE "webhook_delivery_logs"
    ADD CONSTRAINT "webhook_delivery_logs_webhook_id_fkey"
    FOREIGN KEY ("webhook_id") REFERENCES "webhook_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
