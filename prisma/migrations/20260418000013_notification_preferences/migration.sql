-- Migration 20260418000013: notification_preferences
-- Origin: INTAKE-REVIEW TASK-9 (CL-133, CL-135, CL-136)
-- Cria tabela de preferencias de canal por (usuario, evento).

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID        NOT NULL,
  "event"      VARCHAR(50) NOT NULL,
  "channels"   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_event_key"
  ON "notification_preferences" ("user_id", "event");

CREATE INDEX IF NOT EXISTS "notification_preferences_user_id_idx"
  ON "notification_preferences" ("user_id");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: cada usuario so enxerga/atualiza as proprias preferencias.
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_select_own"
  ON "notification_preferences" FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notification_preferences_insert_own"
  ON "notification_preferences" FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_update_own"
  ON "notification_preferences" FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_delete_own"
  ON "notification_preferences" FOR DELETE
  USING (user_id = auth.uid());
