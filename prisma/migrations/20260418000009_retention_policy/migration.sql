-- AlterTable: add retention_until to leads
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "leads_retention_until_idx" ON "leads"("retention_until");

-- AlterTable: add retention_until to raw_lead_data
ALTER TABLE "raw_lead_data"
  ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMP(3);
