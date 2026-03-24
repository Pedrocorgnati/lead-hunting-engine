# RLS Validation — Lead Hunting Engine

**Status:** Pendente — aplicar `prisma/rls-policies.sql` (ou `prisma/migrations/0002_rls_policies/migration.sql`) e executar testes abaixo

**Data de validação:** Pendente (requer banco Supabase configurado com dados de teste)
**Executor:** Pendente

**Nota da auditoria (2026-03-22):** Este documento foi gerado como template durante a execucao do modulo. Os testes de isolamento RLS requerem banco Supabase configurado com pelo menos 2 usuarios e dados de teste. Validar manualmente apos deploy em staging.

---

## Pré-requisito

Aplicar o arquivo `prisma/rls-policies.sql` via Supabase Dashboard → SQL Editor.

---

## Queries de Teste de Isolamento

Executar no Supabase Dashboard → SQL Editor:

### Teste 1: Isolamento de leads por usuário

```sql
-- Simular como usuário A (substituir com UUID real)
SET LOCAL role anon;
SET LOCAL "request.jwt.claims" TO '{"sub": "UUID_DO_ADMIN", "role": "authenticated"}';
SELECT id, user_id, business_name FROM leads LIMIT 5;
-- Esperado: apenas leads do admin

-- Simular como usuário B (operador)
SET LOCAL "request.jwt.claims" TO '{"sub": "UUID_DO_OPERADOR", "role": "authenticated"}';
SELECT id, user_id, business_name FROM leads LIMIT 5;
-- Esperado: apenas leads do operador (zero se não tiver leads)
```

### Teste 2: Admin em audit_logs

```sql
-- Admin deve ter acesso
SET LOCAL "request.jwt.claims" TO '{"sub": "UUID_DO_ADMIN", "role": "authenticated"}';
SELECT COUNT(*) FROM audit_logs;
-- Esperado: COUNT sem erro de permissão

-- Operador não deve ter acesso
SET LOCAL "request.jwt.claims" TO '{"sub": "UUID_DO_OPERADOR", "role": "authenticated"}';
SELECT COUNT(*) FROM audit_logs;
-- Esperado: 0 linhas (policy nega acesso para não-admin)
```

---

## Resultado da Validação

| Tabela | Teste | Status |
|--------|-------|--------|
| user_profiles | Usuário A não vê perfil de B | ⏳ |
| leads | Usuário A não vê leads de B | ⏳ |
| collection_jobs | Usuário A não vê jobs de B | ⏳ |
| invites | Operador não vê convites | ⏳ |
| audit_logs | Operador não lê logs | ⏳ |
| raw_lead_data | Usuário A não vê dados brutos de B | ⏳ |
| pitch_templates | Usuário A não vê templates de B | ⏳ |
| data_provenance | Acesso via leads (isolamento via subquery) | ⏳ |
| api_credentials | Sem RLS — proteção via API handler | N/A |
| scoring_rules | Sem RLS — leitura via service_role | N/A |

---

## Evidência

[Incluir screenshot ou output do SQL Editor após execução dos testes]

---

## Observações Arquiteturais

- Prisma conecta via `service_role` (bypassa RLS automaticamente)
- RLS é a segunda camada de segurança contra acesso direto ao banco
- Toda query via API Route usa filtro `userId` obrigatório no Service
- `api_credentials` e `scoring_rules` não têm RLS de linha — proteção via role check no handler
