-- TASK-10 intake-review (CL-216, CL-243): estende api_usage_logs com campos
-- para rastreabilidade LLM (tokens, custo USD, modelo, operacao, correlation).
-- Implementacao conforme ADR-0006 Opcao 2 (aditiva, sem nova tabela).

CREATE TYPE "UsageKind" AS ENUM ('API', 'LLM');

ALTER TABLE "api_usage_logs"
  ADD COLUMN "kind"            "UsageKind"     NOT NULL DEFAULT 'API',
  ADD COLUMN "model"           VARCHAR(100),
  ADD COLUMN "operation"       VARCHAR(100),
  ADD COLUMN "input_tokens"    INTEGER,
  ADD COLUMN "output_tokens"   INTEGER,
  ADD COLUMN "cost_usd"        DECIMAL(10, 6),
  ADD COLUMN "latency_ms"      INTEGER,
  ADD COLUMN "correlation_id"  VARCHAR(100),
  ADD COLUMN "lead_id"         UUID;

CREATE INDEX "api_usage_logs_kind_timestamp_idx"
  ON "api_usage_logs" ("kind", "timestamp");

-- Indice parcial: so LLM para otimizar queries de custo.
CREATE INDEX "api_usage_logs_llm_provider_model_idx"
  ON "api_usage_logs" ("provider", "model", "timestamp")
  WHERE "kind" = 'LLM';

CREATE INDEX "api_usage_logs_llm_by_job_idx"
  ON "api_usage_logs" ("job_id")
  WHERE "kind" = 'LLM' AND "job_id" IS NOT NULL;
