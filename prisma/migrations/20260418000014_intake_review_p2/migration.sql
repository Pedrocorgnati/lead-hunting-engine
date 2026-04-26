-- Migration 20260418000014: INTAKE-REVIEW P2 (TASK-12 + TASK-13)
-- Origin: INTAKE-REVIEW tasks P2/P3 (CL-188/189/193/209)

ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMP(3);

ALTER TABLE "api_credentials" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "api_credentials" ADD COLUMN IF NOT EXISTS "expiring_notified_at" TIMESTAMP(3);

ALTER TABLE "collection_jobs" ADD COLUMN IF NOT EXISTS "retried_from_id" UUID;

CREATE TABLE IF NOT EXISTS "attachments" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"     UUID         NOT NULL,
  "url"         TEXT         NOT NULL,
  "filename"    VARCHAR(500) NOT NULL,
  "mime_type"   VARCHAR(100) NOT NULL,
  "size"        INTEGER      NOT NULL,
  "uploaded_by" UUID,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attachments_lead_id_idx" ON "attachments" ("lead_id");
