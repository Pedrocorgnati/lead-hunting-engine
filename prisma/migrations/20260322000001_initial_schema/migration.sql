-- Migration: 20260322000001_initial_schema
-- Lead Hunting Engine — Schema inicial completo
-- Gerado em: 2026-03-22
-- Gerado por: /db-migration-create
-- Cobre: M001 (enums) → M011 (indexes) + M014 (audit_logs)
-- Nota: M012 (RLS) em prisma/rls-policies.sql | M013 (seed) em /seed-data-create

-- ─────────────────────────────────────────────────────────────────────────────
-- M001: ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CollectionJobStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'PAUSED',
    'PARTIAL'
);

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM (
    'GOOGLE_MAPS',
    'INSTAGRAM',
    'FACEBOOK',
    'WEBSITE',
    'YELP',
    'APONTADOR',
    'GUIA_MAIS',
    'LINKEDIN_COMPANY',
    'HERE_PLACES',
    'TOMTOM',
    'OUTSCRAPER',
    'APIFY',
    'SHOPEE',
    'MERCADOLIVRE',
    'OVERTURE_MAPS'
);

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'COMPLETE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM (
    'NEW',
    'CONTACTED',
    'CONVERTED',
    'DISCARDED',
    'FALSE_POSITIVE',
    'ENRICHMENT_PENDING'
);

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('COLD', 'WARM', 'HOT');

-- ─────────────────────────────────────────────────────────────────────────────
-- M002: user_profiles
-- Perfil sincronizado com Supabase auth.users. id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "user_profiles" (
    "id"                    UUID            NOT NULL,
    "email"                 VARCHAR(255)    NOT NULL,
    "name"                  VARCHAR(255),
    "role"                  "UserRole"      NOT NULL DEFAULT 'OPERATOR',
    "avatar_url"            TEXT,
    "terms_accepted_at"     TIMESTAMP(3),
    "deletion_requested_at" TIMESTAMP(3),
    "created_at"            TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- ─────────────────────────────────────────────────────────────────────────────
-- M003: invites
-- Convites por email com token único e validade configurável
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "invites" (
    "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
    "email"         VARCHAR(255)    NOT NULL,
    "role"          "UserRole"      NOT NULL DEFAULT 'OPERATOR',
    "status"        "InviteStatus"  NOT NULL DEFAULT 'PENDING',
    "token"         VARCHAR(255)    NOT NULL,
    "invited_by_id" UUID,
    "expires_at"    TIMESTAMP(3)    NOT NULL,
    "accepted_at"   TIMESTAMP(3),
    "created_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");
CREATE INDEX "invites_token_idx"  ON "invites"("token");
CREATE INDEX "invites_email_idx"  ON "invites"("email");

-- ─────────────────────────────────────────────────────────────────────────────
-- M004: api_credentials
-- Credenciais de API criptografadas AES-256-GCM (global, admin only)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "api_credentials" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "provider"       VARCHAR(100) NOT NULL,
    "encrypted_key"  TEXT         NOT NULL,
    "iv"             VARCHAR(32)  NOT NULL,
    "is_active"      BOOLEAN      NOT NULL DEFAULT true,
    "usage_count"    INTEGER      NOT NULL DEFAULT 0,
    "usage_reset_at" TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_credentials_provider_key" ON "api_credentials"("provider");

-- ─────────────────────────────────────────────────────────────────────────────
-- M005: scoring_rules
-- Regras de scoring configuráveis (global, admin only)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "scoring_rules" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"        VARCHAR(255) NOT NULL,
    "slug"        VARCHAR(100) NOT NULL,
    "description" TEXT,
    "weight"      INTEGER      NOT NULL DEFAULT 1,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "condition"   JSONB        NOT NULL,
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scoring_rules_slug_key" ON "scoring_rules"("slug");

-- ─────────────────────────────────────────────────────────────────────────────
-- M006: collection_jobs
-- Job de coleta com parâmetros, status e progresso
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "collection_jobs" (
    "id"               UUID                    NOT NULL DEFAULT gen_random_uuid(),
    "user_id"          UUID                    NOT NULL,
    "status"           "CollectionJobStatus"   NOT NULL DEFAULT 'PENDING',
    "city"             VARCHAR(255)            NOT NULL,
    "state"            VARCHAR(100),
    "country"          VARCHAR(100)            NOT NULL DEFAULT 'BR',
    "niche"            VARCHAR(255)            NOT NULL,
    "sources"          "DataSource"[],
    "limit_val"        INTEGER,
    "total_estimated"  INTEGER,
    "processed_leads"  INTEGER                 NOT NULL DEFAULT 0,
    "current_source"   VARCHAR(50),
    "error_log"        JSONB,
    "started_at"       TIMESTAMP(3),
    "completed_at"     TIMESTAMP(3),
    "created_at"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)            NOT NULL,

    CONSTRAINT "collection_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_jobs_user_id_status_idx" ON "collection_jobs"("user_id", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- M007: leads
-- Perfil consolidado pós-deduplicação com score, temperatura e pitch
-- LGPD: campo `notes` máximo 2000 chars — validação no backend (Zod)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "leads" (
    "id"                   UUID               NOT NULL DEFAULT gen_random_uuid(),
    "user_id"              UUID               NOT NULL,
    "job_id"               UUID,
    "status"               "LeadStatus"       NOT NULL DEFAULT 'NEW',
    "business_name"        VARCHAR(500)       NOT NULL,
    "phone"                VARCHAR(50),
    "phone_normalized"     VARCHAR(20),
    "address"              TEXT,
    "city"                 VARCHAR(255),
    "state"                VARCHAR(100),
    "website"              TEXT,
    "email"                VARCHAR(255),
    "category"             VARCHAR(255),
    "instagram_handle"     VARCHAR(255),
    "instagram_followers"  INTEGER,
    "facebook_url"         TEXT,
    "rating"               DECIMAL(2,1),
    "review_count"         INTEGER,
    "score"                INTEGER            NOT NULL DEFAULT 0,
    "score_breakdown"      JSONB,
    "temperature"          "LeadTemperature"  NOT NULL DEFAULT 'COLD',
    "opportunities"        TEXT[]             NOT NULL DEFAULT '{}',
    "problems"             TEXT[]             NOT NULL DEFAULT '{}',
    "suggestions"          TEXT[]             NOT NULL DEFAULT '{}',
    "pitch_content"        TEXT,
    "pitch_tone"           VARCHAR(50)        DEFAULT 'direto',
    "contacted_at"         TIMESTAMP(3),
    "notes"                TEXT,
    "enrichment_data"      JSONB,
    "created_at"           TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_user_id_score_idx"       ON "leads"("user_id", "score" DESC);
CREATE INDEX "leads_user_id_status_idx"      ON "leads"("user_id", "status");
CREATE INDEX "leads_user_id_temperature_idx" ON "leads"("user_id", "temperature");
CREATE INDEX "leads_user_id_city_idx"        ON "leads"("user_id", "city");
CREATE INDEX "leads_user_id_created_at_idx"  ON "leads"("user_id", "created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- M008: raw_lead_data
-- Dados brutos por fonte. Preserva raw_json para re-processamento.
-- LGPD: campo `photos` REMOVIDO (dados biométricos potenciais — LLD Gap G14)
-- LGPD: raw_json sanitizado no worker antes de persistir (LLD Gap G17)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "raw_lead_data" (
    "id"                    UUID               NOT NULL DEFAULT gen_random_uuid(),
    "job_id"                UUID               NOT NULL,
    "user_id"               UUID               NOT NULL,
    "source"                "DataSource"       NOT NULL,
    "source_url"            TEXT,
    "collected_at"          TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_name"         VARCHAR(500),
    "phone"                 VARCHAR(50),
    "phone_normalized"      VARCHAR(20),
    "address"               TEXT,
    "city"                  VARCHAR(255),
    "state"                 VARCHAR(100),
    "website"               TEXT,
    "email"                 VARCHAR(255),
    "category"              VARCHAR(255),
    "rating"                DECIMAL(2,1),
    "review_count"          INTEGER,
    "instagram_handle"      VARCHAR(255),
    "instagram_followers"   INTEGER,
    "facebook_url"          TEXT,
    "opening_hours"         JSONB,
    "raw_json"              JSONB,
    "enrichment_status"     "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichment_data"       JSONB,
    "lead_id"               UUID,
    "created_at"            TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "raw_lead_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_lead_data_job_id_idx"            ON "raw_lead_data"("job_id");
CREATE INDEX "raw_lead_data_phone_normalized_idx"  ON "raw_lead_data"("phone_normalized");
CREATE INDEX "raw_lead_data_user_id_idx"           ON "raw_lead_data"("user_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- M009: data_provenance
-- Rastreabilidade LGPD: origem de cada dado do lead
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "data_provenance" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "lead_id"          UUID         NOT NULL,
    "source"           "DataSource" NOT NULL,
    "source_url"       TEXT,
    "collected_at"     TIMESTAMP(3) NOT NULL,
    "confidence"       DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "raw_lead_data_id" UUID,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_provenance_lead_id_idx" ON "data_provenance"("lead_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- M010: pitch_templates
-- Templates de pitch salvos pelo operador
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "pitch_templates" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID         NOT NULL,
    "name"        VARCHAR(255) NOT NULL,
    "content"     TEXT         NOT NULL,
    "tone"        VARCHAR(50)  NOT NULL DEFAULT 'direto',
    "is_favorite" BOOLEAN      NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pitch_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pitch_templates_user_id_idx" ON "pitch_templates"("user_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- M014: audit_logs
-- Rastreamento de ações (LGPD Art. 37 + THREAT-009)
-- Segurança: somente INSERT + SELECT para app_user; UPDATE/DELETE revogados
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "audit_logs" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID,
    "action"      VARCHAR(100) NOT NULL,
    "resource"    VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "metadata"    JSONB,
    "ip_address"  VARCHAR(50),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx"    ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx"     ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- M011: FOREIGN KEYS
-- Adicionadas após criação de todas as tabelas para evitar dependência circular
-- ─────────────────────────────────────────────────────────────────────────────

-- invites.invited_by_id → user_profiles.id
ALTER TABLE "invites"
    ADD CONSTRAINT "invites_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id")
    REFERENCES "user_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- collection_jobs.user_id → user_profiles.id
ALTER TABLE "collection_jobs"
    ADD CONSTRAINT "collection_jobs_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- leads.user_id → user_profiles.id
ALTER TABLE "leads"
    ADD CONSTRAINT "leads_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- leads.job_id → collection_jobs.id
ALTER TABLE "leads"
    ADD CONSTRAINT "leads_job_id_fkey"
    FOREIGN KEY ("job_id")
    REFERENCES "collection_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- raw_lead_data.job_id → collection_jobs.id
ALTER TABLE "raw_lead_data"
    ADD CONSTRAINT "raw_lead_data_job_id_fkey"
    FOREIGN KEY ("job_id")
    REFERENCES "collection_jobs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- raw_lead_data.user_id → user_profiles.id
ALTER TABLE "raw_lead_data"
    ADD CONSTRAINT "raw_lead_data_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- raw_lead_data.lead_id → leads.id
ALTER TABLE "raw_lead_data"
    ADD CONSTRAINT "raw_lead_data_lead_id_fkey"
    FOREIGN KEY ("lead_id")
    REFERENCES "leads"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- data_provenance.lead_id → leads.id
ALTER TABLE "data_provenance"
    ADD CONSTRAINT "data_provenance_lead_id_fkey"
    FOREIGN KEY ("lead_id")
    REFERENCES "leads"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- data_provenance.raw_lead_data_id → raw_lead_data.id
ALTER TABLE "data_provenance"
    ADD CONSTRAINT "data_provenance_raw_lead_data_id_fkey"
    FOREIGN KEY ("raw_lead_data_id")
    REFERENCES "raw_lead_data"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- pitch_templates.user_id → user_profiles.id
ALTER TABLE "pitch_templates"
    ADD CONSTRAINT "pitch_templates_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- audit_logs.user_id → user_profiles.id
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Auth Trigger
-- Sincroniza auth.users → user_profiles automaticamente no signup
-- ATENÇÃO: Execute este bloco SEPARADAMENTE no Supabase SQL Editor
-- (requer permissão na schema auth, não é gerenciado pelo Prisma)
-- ─────────────────────────────────────────────────────────────────────────────

-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
-- AS $$
-- BEGIN
--   INSERT INTO public."user_profiles" (id, email, created_at, updated_at)
--   VALUES (NEW.id, NEW.email, NOW(), NOW())
--   ON CONFLICT (id) DO NOTHING;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
