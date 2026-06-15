-- Remove onboarding state from user profiles. The application no longer
-- exposes onboarding routes, gates, actions, or progress APIs.
ALTER TABLE "user_profiles"
  DROP COLUMN IF EXISTS "onboarding_completed_at",
  DROP COLUMN IF EXISTS "onboarding_step",
  DROP COLUMN IF EXISTS "onboarding_data";
