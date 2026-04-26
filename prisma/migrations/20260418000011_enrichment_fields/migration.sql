-- Migration 20260418000011: enrichment_fields + lead_history
-- Origin: INTAKE-REVIEW TASK-5 (CL-057..CL-062, CL-066, CL-079, CL-080)

-- AlterTable: campos de enriquecimento detalhado
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "site_audit"       JSONB,
  ADD COLUMN IF NOT EXISTS "google_reviews"   JSONB,
  ADD COLUMN IF NOT EXISTS "serp_rank"        JSONB,
  ADD COLUMN IF NOT EXISTS "ads_status"       JSONB,
  ADD COLUMN IF NOT EXISTS "tech_stack"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "place_id"         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "facebook_page_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "niche"            VARCHAR(255);

CREATE INDEX IF NOT EXISTS "leads_niche_city_idx" ON "leads"("niche", "city");
CREATE INDEX IF NOT EXISTS "leads_place_id_idx"   ON "leads"("place_id");

-- CreateTable: lead_history
CREATE TABLE IF NOT EXISTS "lead_history" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"    UUID         NOT NULL,
  "field"      VARCHAR(100) NOT NULL,
  "old_value"  JSONB,
  "new_value"  JSONB,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lead_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_history_lead_id_fkey" FOREIGN KEY ("lead_id")
    REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "lead_history_lead_id_changed_at_idx"
  ON "lead_history"("lead_id", "changed_at" DESC);
CREATE INDEX IF NOT EXISTS "lead_history_changed_at_idx"
  ON "lead_history"("changed_at");

-- Enable RLS
ALTER TABLE "lead_history" ENABLE ROW LEVEL SECURITY;

-- Policies: derive ownership from parent lead
DROP POLICY IF EXISTS "lead_history_select" ON "lead_history";
CREATE POLICY "lead_history_select" ON "lead_history" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "leads" l
      WHERE l.id = lead_id
        AND (l.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "lead_history_insert" ON "lead_history";
CREATE POLICY "lead_history_insert" ON "lead_history" FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "leads" l
      WHERE l.id = lead_id
        AND l.user_id = auth.uid()
    )
  );
-- UPDATE/DELETE via service_role apenas
