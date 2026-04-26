-- Migration 0011 (date-coded 20260418000010): account_limits + regions + niches
-- Origin: INTAKE-REVIEW TASK-7 (CL-019, CL-021, CL-112)

-- AlterTable: add per-account limits to user_profiles
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "leads_per_month_max" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "max_concurrent_jobs" INTEGER NOT NULL DEFAULT 3;

-- CreateTable: regions
CREATE TABLE IF NOT EXISTS "regions" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "uf"         VARCHAR(2)   NOT NULL,
  "name"       VARCHAR(100) NOT NULL,
  "capital"    VARCHAR(100) NOT NULL,
  "cities"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "archived"   BOOLEAN      NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "regions_uf_key" ON "regions"("uf");
CREATE INDEX IF NOT EXISTS "regions_archived_idx" ON "regions"("archived");

-- CreateTable: niches
CREATE TABLE IF NOT EXISTS "niches" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "slug"       VARCHAR(100) NOT NULL,
  "label"      VARCHAR(255) NOT NULL,
  "keywords"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "archived"   BOOLEAN      NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "niches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "niches_slug_key" ON "niches"("slug");
CREATE INDEX IF NOT EXISTS "niches_archived_idx" ON "niches"("archived");

-- Enable RLS on new tables (admin-only via is_admin() helper already defined)
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "niches"  ENABLE ROW LEVEL SECURITY;

-- Regions: todo autenticado pode ler não-arquivados; apenas ADMIN escreve
DROP POLICY IF EXISTS "regions_select" ON "regions";
CREATE POLICY "regions_select" ON "regions" FOR SELECT TO authenticated
  USING (archived = false OR public.is_admin());

DROP POLICY IF EXISTS "regions_write" ON "regions";
CREATE POLICY "regions_write" ON "regions" FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Niches: todo autenticado pode ler não-arquivados; apenas ADMIN escreve
DROP POLICY IF EXISTS "niches_select" ON "niches";
CREATE POLICY "niches_select" ON "niches" FOR SELECT TO authenticated
  USING (archived = false OR public.is_admin());

DROP POLICY IF EXISTS "niches_write" ON "niches";
CREATE POLICY "niches_write" ON "niches" FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
