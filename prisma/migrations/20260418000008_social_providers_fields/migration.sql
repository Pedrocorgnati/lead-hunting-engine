-- AlterTable: add social provider fields to raw_lead_data
ALTER TABLE "raw_lead_data"
  ADD COLUMN IF NOT EXISTS "instagram_last_post_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "instagram_post_frequency"  INTEGER,
  ADD COLUMN IF NOT EXISTS "facebook_followers"        INTEGER,
  ADD COLUMN IF NOT EXISTS "facebook_last_post_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "facebook_engagement_rate"  DOUBLE PRECISION;

-- AlterTable: add social provider fields to leads
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "instagram_last_post_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "instagram_post_frequency"  INTEGER,
  ADD COLUMN IF NOT EXISTS "facebook_followers"        INTEGER,
  ADD COLUMN IF NOT EXISTS "facebook_last_post_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "facebook_engagement_rate"  DOUBLE PRECISION;
