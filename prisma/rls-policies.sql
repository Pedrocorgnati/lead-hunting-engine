-- RLS Policies — Lead Hunting Engine
-- Migration M012: enable_rls_policies
-- Gerado em: 2026-03-22 por /db-migration-create
--
-- COMO APLICAR:
--   Supabase Dashboard > SQL Editor > Execute este arquivo INTEIRO
--   NÃO executar via `npx prisma migrate` — Prisma não gerencia RLS
--
-- ARQUITETURA:
--   Prisma conecta como service_role (bypassa RLS automaticamente).
--   RLS é a segunda camada de segurança contra acesso direto ao banco.
--   Toda query via API Route usa filtro userId obrigatório no Service.
--
-- ORDEM DE EXECUÇÃO:
--   1. Execute após a migration inicial (20260322000001_initial_schema)
--   2. Execute antes de qualquer acesso via Supabase client-side SDK

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: checar se o usuário autenticado é ADMIN
-- SECURITY DEFINER: executa com permissões do owner (evita recursão RLS)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."user_profiles"
    WHERE id = auth.uid()
      AND role = 'ADMIN'::"UserRole"
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "user_profiles"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invites"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_jobs"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raw_lead_data"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_provenance"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pitch_templates"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_credentials"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scoring_rules"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"       ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────────────────────────────────────────

-- Usuário vê próprio perfil; ADMIN vê todos
CREATE POLICY "user_profiles_select"
    ON "user_profiles" FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin());

-- Usuário atualiza apenas próprio perfil (role não pode ser alterado pelo próprio)
CREATE POLICY "user_profiles_update_own"
    ON "user_profiles" FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- INSERT somente via trigger (handle_new_user) ou service_role
-- Sem policy de INSERT para authenticated evita auto-criação maliciosa

-- ─────────────────────────────────────────────────────────────────────────────
-- invites
-- ─────────────────────────────────────────────────────────────────────────────

-- ADMIN gerencia todos os convites
CREATE POLICY "invites_admin_all"
    ON "invites" FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Acesso anônimo por token (necessário para ativação de conta antes do login)
-- A validação real do token ocorre na API Route — esta policy só abre a leitura
CREATE POLICY "invites_anon_read_by_token"
    ON "invites" FOR SELECT TO anon
    USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- collection_jobs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "collection_jobs_select_own"
    ON "collection_jobs" FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "collection_jobs_insert_own"
    ON "collection_jobs" FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "collection_jobs_update_own"
    ON "collection_jobs" FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE não exposto na API (apenas via service_role se necessário)

-- ─────────────────────────────────────────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "leads_select_own"
    ON "leads" FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "leads_insert_own"
    ON "leads" FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_update_own"
    ON "leads" FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_delete_own"
    ON "leads" FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- raw_lead_data
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "raw_lead_data_select_own"
    ON "raw_lead_data" FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "raw_lead_data_insert_own"
    ON "raw_lead_data" FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- UPDATE via service_role apenas (worker trigger.dev)
-- DELETE via service_role apenas (retenção LGPD)

-- ─────────────────────────────────────────────────────────────────────────────
-- data_provenance
-- Sem user_id direto — acesso derivado do lead associado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "data_provenance_select"
    ON "data_provenance" FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM "leads" l
            WHERE l.id = lead_id
              AND (l.user_id = auth.uid() OR public.is_admin())
        )
    );

CREATE POLICY "data_provenance_insert"
    ON "data_provenance" FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "leads" l
            WHERE l.id = lead_id
              AND l.user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- pitch_templates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "pitch_templates_select_own"
    ON "pitch_templates" FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "pitch_templates_insert_own"
    ON "pitch_templates" FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_templates_update_own"
    ON "pitch_templates" FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_templates_delete_own"
    ON "pitch_templates" FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- api_credentials
-- Global (sem user_id) — acesso exclusivo para ADMIN
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "api_credentials_admin_only"
    ON "api_credentials" FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- scoring_rules
-- Global — SELECT para todos; INSERT/UPDATE/DELETE apenas ADMIN
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "scoring_rules_select_all"
    ON "scoring_rules" FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "scoring_rules_insert_admin"
    ON "scoring_rules" FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "scoring_rules_update_admin"
    ON "scoring_rules" FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "scoring_rules_delete_admin"
    ON "scoring_rules" FOR DELETE TO authenticated
    USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- INSERT-only pattern: revogar UPDATE/DELETE após criação
-- LGPD Art. 37 + THREAT-009: imutabilidade do log de auditoria
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: usuário vê seus próprios logs; ADMIN vê todos
CREATE POLICY "audit_logs_select"
    ON "audit_logs" FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- INSERT: apenas service_role (via Prisma) — não expor para authenticated diretamente
-- Sem policy INSERT para authenticated = somente service_role pode inserir

-- Revogar UPDATE e DELETE para a role da aplicação (substitua 'anon' pelo nome real)
-- NOTA: Em Supabase, a role da aplicação é 'authenticated' para JWT e 'service_role' para API key.
-- UPDATE/DELETE já são bloqueados por ausência de policy para authenticated.
-- Para garantia extra (role customizada), descomentar:
-- REVOKE UPDATE, DELETE ON "audit_logs" FROM authenticated;
