-- Item 072 / C15: persistencia real de device push tokens + recibo de entrega
CREATE TABLE "device_push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(10) NOT NULL DEFAULT 'web',
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_push_tokens_token_key" ON "device_push_tokens"("token");
CREATE INDEX "device_push_tokens_user_id_idx" ON "device_push_tokens"("user_id");

ALTER TABLE "notifications" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN "delivery_channel" VARCHAR(20);
