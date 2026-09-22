-- CreateTable
CREATE TABLE "mcp_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rate_limit" INTEGER,
    "last_used_at" TIMESTAMP(3),
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_api_keys_key_hash_key" ON "mcp_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "mcp_api_keys_user_id_idx" ON "mcp_api_keys"("user_id");

-- CreateIndex
CREATE INDEX "mcp_api_keys_key_hash_idx" ON "mcp_api_keys"("key_hash");

-- AddForeignKey
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "mcp_call_logs" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "tool_name" TEXT,
    "status" TEXT NOT NULL,
    "error_code" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_call_logs_api_key_id_idx" ON "mcp_call_logs"("api_key_id");

-- CreateIndex
CREATE INDEX "mcp_call_logs_user_id_idx" ON "mcp_call_logs"("user_id");

-- CreateIndex
CREATE INDEX "mcp_call_logs_created_at_idx" ON "mcp_call_logs"("created_at");

-- CreateIndex
CREATE INDEX "mcp_call_logs_tool_name_idx" ON "mcp_call_logs"("tool_name");

-- AddForeignKey
ALTER TABLE "mcp_call_logs" ADD CONSTRAINT "mcp_call_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "mcp_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
