-- Migration: add_feature_flags
-- module-16 (Fase 2) — ADR-0042 provider local Postgres-backed.
-- Cria 3 tabelas: feature_flags, feature_flag_changes, feature_flag_usages
-- + indexes + FKs.

-- CreateTable feature_flags
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "owner_module" VARCHAR(100) NOT NULL,
    "default_value" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "env_values" JSONB NOT NULL DEFAULT '{}',
    "external_provider_id" VARCHAR(200),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(64) NOT NULL,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flags_name_key" ON "feature_flags"("name");
CREATE INDEX "feature_flags_owner_module_idx" ON "feature_flags"("owner_module");
CREATE INDEX "feature_flags_tags_idx" ON "feature_flags" USING GIN ("tags");
CREATE INDEX "feature_flags_archived_at_idx" ON "feature_flags"("archived_at");

-- CreateTable feature_flag_changes (audit imutavel)
CREATE TABLE "feature_flag_changes" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "env" VARCHAR(20) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "before_value" JSONB NOT NULL,
    "after_value" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "changed_by" VARCHAR(64) NOT NULL,
    "changed_by_email" VARCHAR(180) NOT NULL,
    "ip_address" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flag_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_changes_flag_created_idx" ON "feature_flag_changes"("flag_id", "created_at" DESC);
CREATE INDEX "feature_flag_changes_changedBy_created_idx" ON "feature_flag_changes"("changed_by", "created_at" DESC);
CREATE INDEX "feature_flag_changes_env_created_idx" ON "feature_flag_changes"("env", "created_at" DESC);

-- CreateTable feature_flag_usages (scan estatico)
CREATE TABLE "feature_flag_usages" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "file_path" VARCHAR(400) NOT NULL,
    "line_start" INTEGER NOT NULL,
    "line_end" INTEGER NOT NULL,
    "snippet" VARCHAR(500) NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flag_usages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_usages_flag_idx" ON "feature_flag_usages"("flag_id");
CREATE INDEX "feature_flag_usages_file_idx" ON "feature_flag_usages"("file_path");

-- FKs
ALTER TABLE "feature_flag_changes"
  ADD CONSTRAINT "feature_flag_changes_flag_id_fkey"
  FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feature_flag_usages"
  ADD CONSTRAINT "feature_flag_usages_flag_id_fkey"
  FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill flag canonica usada pelo healthcheck (TASK-1).
INSERT INTO "feature_flags"
  ("id", "name", "description", "owner_module", "default_value", "tags", "env_values", "created_at", "updated_at", "created_by")
VALUES (
  'sysflag_healthcheck_echo',
  'system.healthcheck.echo',
  'Flag canonica usada pelo healthcheck /api/v1/health/feature-flags. Sempre default true.',
  'module-16-feature-flags-foundation',
  'true'::jsonb,
  ARRAY['system', 'healthcheck']::TEXT[],
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'system'
)
ON CONFLICT ("name") DO NOTHING;
