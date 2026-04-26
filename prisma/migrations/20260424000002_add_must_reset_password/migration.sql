-- TASK-7 intake-review (CL-473): admin pode forcar troca de senha de usuarios
-- Adiciona flag must_reset_password em user_profiles.

ALTER TABLE "user_profiles"
  ADD COLUMN "must_reset_password" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "user_profiles_must_reset_password_idx"
  ON "user_profiles" ("must_reset_password")
  WHERE "must_reset_password" = true;
