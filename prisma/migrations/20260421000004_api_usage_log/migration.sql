-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(100) NOT NULL,
    "call_type" VARCHAR(50) NOT NULL,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID,
    "job_id" UUID,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_usage_logs_provider_timestamp_idx" ON "api_usage_logs"("provider", "timestamp");
CREATE INDEX "api_usage_logs_provider_call_type_timestamp_idx" ON "api_usage_logs"("provider", "call_type", "timestamp");
CREATE INDEX "api_usage_logs_user_id_timestamp_idx" ON "api_usage_logs"("user_id", "timestamp");
