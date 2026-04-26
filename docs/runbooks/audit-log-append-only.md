# Runbook — AuditLog append-only (CL-352 / TASK-24)

## Escopo

A tabela `audit_logs` e protegida contra UPDATE e DELETE por uma trigger
`BEFORE UPDATE/DELETE` chamada `audit_log_readonly`. A migration que
instala os triggers e `20260424000003_audit_log_append_only`.

Objetivo: garantir integridade forense dos eventos de seguranca,
compliance (LGPD/LHE-COMP-001) e rastreabilidade de acoes privilegiadas
mesmo na hipotese de um bug ou comprometimento na camada de aplicacao.

## Tecnica

- `CREATE OR REPLACE FUNCTION audit_log_readonly()` levanta `RAISE EXCEPTION`
  com ERRCODE `42501` (insufficient privilege) — padrao para politicas de
  acesso no Postgres.
- Triggers `BEFORE UPDATE`/`BEFORE DELETE` rodam antes que qualquer
  modificacao seja persistida.
- INSERT permanece liberado — o audit service continua gravando novos
  eventos normalmente.

## Limites conhecidos

| Operacao | Protegida? | Observacao |
|----------|-----------|------------|
| `UPDATE`/`DELETE` via usuario da aplicacao | ✅ sim | trigger aborta |
| `UPDATE`/`DELETE` via role com `BYPASSRLS` | ⚠️ trigger ainda dispara, bypass nao aplica aqui |
| `TRUNCATE audit_logs` | ❌ nao protegido | Requer superuser (supabase_admin). Deve ser auditado fora do DB |
| `DROP TRIGGER audit_log_no_mod_update` | ❌ nao protegido | Requer ownership da tabela |
| Replicacao logica (WAL) | ✅ imutavel | WAL e append-only por natureza |

## Manutencao e retencao

Nao execute DELETE para expurgar logs antigos. Se for necessario
implementar retencao (ex: LGPD 24 meses), preferir:

1. Criar tabela `audit_log_archive` com mesma estrutura.
2. Migration COPY para archive + TRUNCATE do `audit_logs` em janela de
   manutencao com superuser, com rastro em `audit_log_archive_operations`.
3. VIEW `audit_logs_union` (`audit_logs UNION ALL audit_log_archive`)
   para consultas historicas.

## Como testar apos deploy

```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE audit_logs SET action = 'tampered' WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- Esperado: ERROR: audit_logs is append-only — UPDATE/DELETE denied

DELETE FROM audit_logs LIMIT 1;
-- Esperado: mesmo erro
SQL
```

Smoke regression: disparar `/api/v1/auth/login` e conferir que nova row
aparece em `audit_logs` (INSERT nao foi afetado).

## Rollback

```sql
DROP TRIGGER IF EXISTS audit_log_no_mod_update ON "audit_logs";
DROP TRIGGER IF EXISTS audit_log_no_mod_delete ON "audit_logs";
DROP FUNCTION IF EXISTS audit_log_readonly();
```

Rollback so deve ser realizado em janela de manutencao com aprovacao
explicita do responsavel por compliance.
