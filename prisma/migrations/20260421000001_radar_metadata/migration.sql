-- Migration 20260421000001: Radar orquestrador (TASK-2 intake-review)
-- Origin: INTAKE-REVIEW P1 TASK-2 (CL-102/103/104)
-- Adiciona metadata JSONB em collection_jobs (origin=RADAR) e leads (radarJobIds[], isNewFromRadar)

ALTER TABLE "collection_jobs" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Indice parcial para filtrar jobs do Radar rapidamente
CREATE INDEX IF NOT EXISTS "collection_jobs_radar_origin_idx"
  ON "collection_jobs" ((metadata ->> 'origin'))
  WHERE metadata ->> 'origin' = 'RADAR';
