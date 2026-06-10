-- Reconciliacao migrations <-> schema.prisma (2026-06-09).
-- O chain de migrations nunca havia sido aplicado em banco limpo; models adicionados
-- ao schema durante o loop 05-27 (classification_rules, push_subscriptions, enum
-- OpportunityType, signals de leads) nao tinham migration correspondente.
-- Gerado por: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('A_NEEDS_SITE', 'B_NEEDS_SYSTEM', 'C_NEEDS_AUTOMATION', 'D_NEEDS_ECOMMERCE', 'E_SCALE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CollectionJobStatus" ADD VALUE 'FAILED_TERMINAL';
ALTER TYPE "CollectionJobStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "nps_responses" DROP CONSTRAINT "nps_responses_user_fkey";

-- DropIndex
DROP INDEX "feature_flag_changes_changedBy_created_idx";

-- DropIndex
DROP INDEX "feature_flag_changes_correlation_id_idx";

-- DropIndex
DROP INDEX "feature_flag_changes_env_created_idx";

-- DropIndex
DROP INDEX "feature_flag_changes_flag_created_idx";

-- DropIndex
DROP INDEX "feature_flags_tags_idx";

-- DropIndex
DROP INDEX "leads_niche_city_idx";

-- DropIndex
DROP INDEX "leads_place_id_idx";

-- AlterTable
ALTER TABLE "api_credentials" ALTER COLUMN "last_validated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "data_provenance" ADD COLUMN     "field" VARCHAR(100) NOT NULL;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "analytics_pixels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ecommerce_platform" VARCHAR(50),
ADD COLUMN     "false_positive_reason" TEXT,
ADD COLUMN     "has_ecommerce" BOOLEAN,
ADD COLUMN     "is_whatsapp_channel" BOOLEAN,
ADD COLUMN     "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "opportunities",
ADD COLUMN     "opportunities" "OpportunityType"[],
ALTER COLUMN "pitch_tone" SET DEFAULT 'formal';

-- AlterTable
ALTER TABLE "login_attempts" ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notification_preferences" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pitch_templates" ALTER COLUMN "tone" SET DEFAULT 'formal';

-- AlterTable
ALTER TABLE "system_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "classification_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opportunity_type" "OpportunityType" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "min_score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "badge_color" VARCHAR(20) NOT NULL DEFAULT 'blue',
    "required_signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_rule_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opportunity_type" VARCHAR(50) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by" UUID,
    "change_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_rule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classification_rules_sort_order_idx" ON "classification_rules"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "classification_rules_opportunity_type_key" ON "classification_rules"("opportunity_type");

-- CreateIndex
CREATE INDEX "classification_rule_history_opportunity_type_created_at_idx" ON "classification_rule_history"("opportunity_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "feature_flag_changes_flag_id_created_at_idx" ON "feature_flag_changes"("flag_id", "created_at");

-- CreateIndex
CREATE INDEX "feature_flag_changes_changed_by_created_at_idx" ON "feature_flag_changes"("changed_by", "created_at");

-- CreateIndex
CREATE INDEX "feature_flag_changes_env_created_at_idx" ON "feature_flag_changes"("env", "created_at");

-- CreateIndex
CREATE INDEX "feature_flags_tags_idx" ON "feature_flags"("tags");

-- AddForeignKey
ALTER TABLE "scoring_rule_history" ADD CONSTRAINT "scoring_rule_history_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "scoring_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "duplicate_candidates_primary_candidate_key" RENAME TO "duplicate_candidates_primary_lead_id_candidate_lead_id_key";

-- RenameIndex
ALTER INDEX "export_history_status_created_idx" RENAME TO "export_history_status_created_at_idx";

-- RenameIndex
ALTER INDEX "export_history_user_created_idx" RENAME TO "export_history_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "feature_flag_usages_file_idx" RENAME TO "feature_flag_usages_file_path_idx";

-- RenameIndex
ALTER INDEX "feature_flag_usages_flag_idx" RENAME TO "feature_flag_usages_flag_id_idx";

-- RenameIndex
ALTER INDEX "lead_tags_lead_user_label_key" RENAME TO "lead_tags_lead_id_user_id_label_key";

-- RenameIndex
ALTER INDEX "lead_tags_user_label_idx" RENAME TO "lead_tags_user_id_label_idx";

-- RenameIndex
ALTER INDEX "saved_views_user_created_idx" RENAME TO "saved_views_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "saved_views_user_name_key" RENAME TO "saved_views_user_id_name_key";

-- RenameIndex
ALTER INDEX "sent_alerts_rule_day_key" RENAME TO "sent_alerts_rule_day_key_key";
