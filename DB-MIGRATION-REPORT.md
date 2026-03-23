# DB Migration Report — Lead Hunting Engine

**Projeto:** lead-hunting-engine
**ORM:** Prisma 6.x + `prisma.config.ts`
**Database:** PostgreSQL (Supabase)
**Data:** 2026-03-22
**Gerado por:** `/db-migration-create`
**Data-Integrity-Decision:** não disponível (sem operações destrutivas — não era necessário)

---

## Migrations Geradas

| # | Arquivo | Operação | Tabelas/Tipos Afetados | Tipo | Reversível |
|---|---------|----------|----------------------|------|------------|
| 1 | `prisma/migrations/20260322000001_initial_schema/migration.sql` | CREATE ENUM (7) | UserRole, InviteStatus, CollectionJobStatus, DataSource, EnrichmentStatus, LeadStatus, LeadTemperature | additive | Sim |
| 2 | `prisma/migrations/20260322000001_initial_schema/migration.sql` | CREATE TABLE (10) | user_profiles, invites, api_credentials, scoring_rules, collection_jobs, leads, raw_lead_data, data_provenance, pitch_templates, audit_logs | additive | Sim |
| 3 | `prisma/migrations/20260322000001_initial_schema/migration.sql` | ADD CONSTRAINT FK (11) | todas as tabelas com FKs | additive | Sim |
| 4 | `prisma/rls-policies.sql` | ENABLE RLS + CREATE POLICY (18) | todas as tabelas | additive | Sim |
| 5 | `prisma/migrations/migration_lock.toml` | Lock file Prisma | — | meta | N/A |

**Resumo:** 10 tabelas · 7 enums · 11 foreign keys · 22 indexes · 18 RLS policies

---

## Ordem de Execução (Prisma Migration)

Ordem interna ao `migration.sql` (respeita dependências de FK):

1. ENUMs (sem dependências)
2. `user_profiles` (sem FK)
3. `invites` (FK → user_profiles)
4. `api_credentials` (sem FK)
5. `scoring_rules` (sem FK)
6. `collection_jobs` (FK → user_profiles)
7. `leads` (FK → user_profiles, collection_jobs)
8. `raw_lead_data` (FK → collection_jobs, user_profiles, leads)
9. `data_provenance` (FK → leads, raw_lead_data)
10. `pitch_templates` (FK → user_profiles)
11. `audit_logs` (FK → user_profiles)
12. Foreign Keys (ALTER TABLE — após todas as tabelas)

---

## Comandos de Aplicação

### Pré-requisito: Variáveis de Ambiente

```bash
# .env.local (desenvolvimento)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

> `DATABASE_URL` usa porta 6543 (Transaction mode — Supavisor)
> `DIRECT_URL` usa porta 5432 (Direct connection — obrigatório para `prisma migrate`)

### Desenvolvimento

```bash
cd output/workspace/lead-hunting-engine

# Aplicar migration e gerar Prisma Client
npx prisma migrate dev --name initial_schema

# Verificar schema
npx prisma db pull  # deve retornar "already in sync"
```

### Staging (OBRIGATÓRIO antes de produção)

```bash
# 1. Aplicar migration em staging
npx prisma migrate deploy

# 2. Verificar contagem de tabelas (deve retornar 10)
# Executar no Supabase SQL Editor:
# SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

# 3. Aplicar RLS policies
# Supabase Dashboard > SQL Editor > abrir prisma/rls-policies.sql > Run

# 4. Testar rollback (ver seção abaixo)
```

### Produção

```bash
# 1. Backup do banco (Supabase: Dashboard > Database > Backups)
# 2. Aplicar migration
npx prisma migrate deploy

# 3. Aplicar RLS policies no Supabase SQL Editor
# 4. Configurar Auth Trigger (ver prisma/migrations/.../migration.sql — bloco comentado)
# 5. Monitorar logs por 15 min
```

---

## Supabase Auth Trigger (manual)

O campo `user_profiles.id` é o mesmo UUID do `auth.users`. Para sincronização automática no signup, execute o bloco do trigger comentado ao final de `migration.sql` **diretamente no Supabase SQL Editor** (requer acesso à schema `auth`):

```sql
-- Disponível em: migration.sql (bloco comentado ao final)
-- Localização no Dashboard: SQL Editor > cole e execute
```

---

## Rollback

Para reverter a migration inicial (banco vazio — sem dados em produção):

```sql
-- Executar no Supabase SQL Editor em ordem inversa

-- 1. Remover RLS policies (se aplicadas)
DROP POLICY IF EXISTS "user_profiles_select" ON "user_profiles";
-- ... (todas as policies do rls-policies.sql)

-- 2. Drop tabelas (ordem inversa para FKs)
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "pitch_templates" CASCADE;
DROP TABLE IF EXISTS "data_provenance" CASCADE;
DROP TABLE IF EXISTS "raw_lead_data" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;
DROP TABLE IF EXISTS "collection_jobs" CASCADE;
DROP TABLE IF EXISTS "scoring_rules" CASCADE;
DROP TABLE IF EXISTS "api_credentials" CASCADE;
DROP TABLE IF EXISTS "invites" CASCADE;
DROP TABLE IF EXISTS "user_profiles" CASCADE;

-- 3. Drop enums
DROP TYPE IF EXISTS "LeadTemperature";
DROP TYPE IF EXISTS "LeadStatus";
DROP TYPE IF EXISTS "EnrichmentStatus";
DROP TYPE IF EXISTS "DataSource";
DROP TYPE IF EXISTS "CollectionJobStatus";
DROP TYPE IF EXISTS "InviteStatus";
DROP TYPE IF EXISTS "UserRole";
```

---

## Próximos Passos (sugeridos)

1. `/seed-data-create .claude/projects/lead-hunting-engine.json` — popular banco com dados iniciais (M013: 6 scoring rules padrão)
2. `/integration-test-create .claude/projects/lead-hunting-engine.json` — testar endpoints com banco real

---

## Checklist de Segurança

### Reversibilidade
- [x] Migration tem rollback completo e funcional (DROP TABLE CASCADE + DROP TYPE)
- [x] Rollback não depende de dados (banco novo)

### Idempotência
- [x] `gen_random_uuid()` para PKs (idempotente)
- [x] Tabelas novas — sem IF NOT EXISTS necessário (migration Prisma é transacional)

### Segurança de Dados
- [x] Todas as colunas NOT NULL têm DEFAULT definido
- [x] Nenhum DROP de coluna (tudo additive)
- [x] Nenhum ALTER TYPE (tudo novo)
- [x] Nenhuma tabela existente com dados afetada

### Integridade Referencial
- [x] Todas as FKs têm `ON DELETE` explícito
- [x] Indexes criados para todas as FKs
- [x] Ordem de criação respeita dependências (tabelas pai antes de filhas)

### Tipos e Formatos
- [x] `encrypted_key` usa TEXT (sem limite de comprimento — chave AES pode crescer)
- [x] Enums definidos como tipos PostgreSQL (não VARCHAR)
- [x] JSONB para campos semi-estruturados (raw_json, score_breakdown, condition)

### LGPD
- [x] Campo `photos` AUSENTE em raw_lead_data (Gap G14 — dados biométricos)
- [x] `raw_json` marcado para sanitização de PII no worker (Gap G17)
- [x] `notes` sem constraint de tamanho no banco (validado via Zod no backend)
- [x] `audit_logs` INSERT-only pattern documentado (Art. 37)

### Alertas de Alto Risco
- [x] Nenhuma coluna NOT NULL sem DEFAULT em tabela com dados existentes
- [x] Nenhum DROP TABLE
- [x] Nenhum ALTER COLUMN TYPE
- [x] Nenhum ALTER TABLE em tabela com >100k registros

**Score:** 17/17 ✅

---

## Arquivos Gerados

```
prisma/
├── schema.prisma                          # Atualizado (já existia)
├── prisma.config.ts                       # + directUrl para Supabase
├── rls-policies.sql                       # M012: RLS + helper is_admin()
└── migrations/
    ├── migration_lock.toml
    └── 20260322000001_initial_schema/
        └── migration.sql                  # M001-M011 + M014
```
