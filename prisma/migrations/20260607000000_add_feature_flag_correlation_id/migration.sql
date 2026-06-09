-- Migration: add_feature_flag_correlation_id
-- Adiciona correlation_id à tabela feature_flag_changes para rastreabilidade.

ALTER TABLE "feature_flag_changes"
  ADD COLUMN "correlation_id" VARCHAR(100);

CREATE INDEX "feature_flag_changes_correlation_id_idx" ON "feature_flag_changes"("correlation_id");
