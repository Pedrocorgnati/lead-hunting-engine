-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "do_not_disturb_start" VARCHAR(5),
ADD COLUMN IF NOT EXISTS "do_not_disturb_end" VARCHAR(5);
