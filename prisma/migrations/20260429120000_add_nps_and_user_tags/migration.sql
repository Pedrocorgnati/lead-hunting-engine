-- M14-G-006 + M14-G-010: adiciona NpsResponse table, UserProfile.tags array
-- e seed de SystemConfig para nps_enabled (M14-G-019).

-- 1) Tags por usuario (cohort piloto, etc)
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "user_profiles_tags_idx"
  ON "user_profiles" USING GIN ("tags");

-- 2) NPS responses
CREATE TABLE IF NOT EXISTS "nps_responses" (
  "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID            NOT NULL,
  "score"          INTEGER         NOT NULL,
  "comment"        TEXT,
  "submitted_at"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_agent"     VARCHAR(500),
  "survey_version" VARCHAR(20)     NOT NULL DEFAULT 'v1',

  CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nps_responses_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "nps_responses_score_range"
    CHECK ("score" >= 0 AND "score" <= 10)
);

CREATE INDEX IF NOT EXISTS "nps_responses_user_id_idx"
  ON "nps_responses"("user_id");

CREATE INDEX IF NOT EXISTS "nps_responses_submitted_at_idx"
  ON "nps_responses"("submitted_at");

-- 3) Seed do feature flag M14-G-019 (segue convencao dotted + { value }
-- ja usada em src/lib/services/system-config.ts).
INSERT INTO "system_config" ("key", "value", "updated_at")
VALUES
  ('nps.enabled',                  '{"value": true}'::jsonb,  CURRENT_TIMESTAMP),
  ('nps.min_days_active',          '{"value": 7}'::jsonb,     CURRENT_TIMESTAMP),
  ('nps.min_leads_collected',      '{"value": 3}'::jsonb,     CURRENT_TIMESTAMP),
  ('nps.response_cooldown_days',   '{"value": 90}'::jsonb,    CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
