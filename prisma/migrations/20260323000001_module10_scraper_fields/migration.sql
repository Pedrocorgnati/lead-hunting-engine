-- Migration: module10_scraper_fields
-- Add fields required by module-10-scraper-worker

-- CollectionJob: add trigger tracking + progress fields
ALTER TABLE "collection_jobs"
  ADD COLUMN IF NOT EXISTS "trigger_id"    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "progress"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "result_count"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT;

-- RawLeadData: add external dedup id + geo + site analysis fields
ALTER TABLE "raw_lead_data"
  ADD COLUMN IF NOT EXISTS "external_id"         VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "lat"                 DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "lng"                 DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "open_now"            BOOLEAN,
  ADD COLUMN IF NOT EXISTS "price_level"         INTEGER,
  ADD COLUMN IF NOT EXISTS "site_reachable"      BOOLEAN,
  ADD COLUMN IF NOT EXISTS "site_has_ssl"        BOOLEAN,
  ADD COLUMN IF NOT EXISTS "site_title"          VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "site_mobile_friendly" BOOLEAN;

-- Unique index on external_id (for upsert deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS "raw_lead_data_external_id_key"
  ON "raw_lead_data" ("external_id")
  WHERE "external_id" IS NOT NULL;
