-- Migration 20260418000012: onboarding_progress
-- Origin: INTAKE-REVIEW TASK-8 (CL-126..CL-131, CL-215)
-- Adiciona persistência do passo atual e dados parciais do wizard de onboarding.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_step" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onboarding_data" JSONB;
