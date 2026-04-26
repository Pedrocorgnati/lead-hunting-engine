ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "facebook_abandoned" BOOLEAN;

CREATE INDEX IF NOT EXISTS "leads_facebook_abandoned_idx"
  ON "leads" ("facebook_abandoned")
  WHERE "facebook_abandoned" = TRUE;
