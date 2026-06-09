-- AlterTable: add cost, audit_summary, last_validated_at to api_credentials (nullable, idempotent)
ALTER TABLE "api_credentials"
  ADD COLUMN IF NOT EXISTS "cost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "audit_summary" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "last_validated_at" TIMESTAMPTZ;
