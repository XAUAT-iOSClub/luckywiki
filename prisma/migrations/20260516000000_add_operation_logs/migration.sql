-- CreateEnum
CREATE TYPE "LogAction" AS ENUM ('CREATE_ARTICLE', 'UPDATE_ARTICLE', 'DELETE_ARTICLE', 'APPROVE_COMMENT', 'REJECT_COMMENT', 'SET_ARTICLE_STATUS', 'SET_USER_ROLE');

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "action" "LogAction" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "detail" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logs_action_idx" ON "logs"("action");

-- CreateIndex
CREATE INDEX "logs_user_id_idx" ON "logs"("user_id");

-- CreateIndex
CREATE INDEX "logs_created_at_idx" ON "logs"("created_at");

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
