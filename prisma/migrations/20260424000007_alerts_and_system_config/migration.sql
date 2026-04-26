-- TASK-13 intake-review: SystemConfig (alertas + thresholds) + SentAlert (dedup).

CREATE TABLE "system_config" (
    "key"        VARCHAR(120) NOT NULL,
    "value"      JSONB        NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "sent_alerts" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "rule"       VARCHAR(80)  NOT NULL,
    "day_key"    VARCHAR(20)  NOT NULL,
    "payload"    JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sent_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sent_alerts_rule_day_key" ON "sent_alerts" ("rule", "day_key");
CREATE INDEX "sent_alerts_created_at_idx" ON "sent_alerts" ("created_at");

-- Seed defaults (idempotente)
INSERT INTO "system_config" ("key", "value") VALUES
  ('alert.llm.monthly_usd',   '{"threshold": 50}'::jsonb),
  ('alert.api.daily_calls',   '{"threshold": 10000}'::jsonb),
  ('alert.job.stuck_minutes', '{"threshold": 15}'::jsonb),
  ('export.sync_max_rows',    '{"value": 500}'::jsonb),
  ('export.signed_url_ttl_hours', '{"value": 24}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
