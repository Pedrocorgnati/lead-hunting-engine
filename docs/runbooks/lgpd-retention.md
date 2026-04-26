# Runbook — LGPD Retention

**Escopo:** política de retenção dos artefatos PII criados pela intake-review gaplist (TASK-2, 3, 9, 22) e por TASK-18/ST005 (ContactEvent), com sweeper automatizado e procedimento de DSAR.

**Base legal** (LGPD Art. 7º/16º/18º + Art. 5º CF):
- Art. 15 I — finalidade alcançada ou consentimento revogado
- Art. 16 I — cumprimento de obrigação legal
- Art. 18 VI — eliminação sob solicitação

Código canônico: `src/lib/workers/retention-sweeper.ts`.
Cron: `/api/v1/cron/retention-sweep` (diário às 05:00 UTC, vercel.json).

---

## Tabela de retenção

| Entidade | Default (dias) | Chave SystemConfig | Base legal | Campos anonimizados |
|----------|---------------|-------------------|------------|---------------------|
| WaitlistEntry | 365 | `retention.waitlist_entry_days` | Consentimento (pre-lead) | `email` → hash; `name` → null |
| ContactMessage | 180 (pós-READ/REPLIED/ARCHIVED) | `retention.contact_message_days` | Legítimo interesse (comunicação) | `email` → hash; `name` → null; `message` → "[anonimizado]" |
| LandingConsent | 730 | `retention.landing_consent_days` | Prova de consentimento | `ipHash` → `anonymized:expired` |
| ExportHistory | 30 | `retention.export_history_days` | Operação técnica | `filters` → `{anonymized:true}`; `status` → `EXPIRED` |
| LeadHistory.snapshot | 90 | `retention.lead_history_snapshot_days` | Auditoria produto | `oldValue`/`newValue` → `{anonymized:true}` (row preservada) |

> Defaults propagados por `prisma/migrations/20260424000010_retention_config`. Ajustáveis via `setConfig()` ou endpoint admin (TASK-13 alerts UI usando mesmo pattern).

---

## Sweep flow

1. `/api/v1/cron/retention-sweep` autentica via `Bearer $CRON_SECRET`.
2. Executa em sequência: Waitlist → ContactMessage → LandingConsent → ExportHistory → LeadHistory.snapshot.
3. Cada entidade processa lote de 500 (evita lock longo).
4. Anonimização usa `sha256:` prefix (não DELETE) — mantém FK e analytics agregado intactos.
5. Registra `AuditLog` com counts por entidade. Falhas em 1 entidade não abortam as outras.

### Markers canônicos de anonimização (auditabilidade)

Não há coluna dedicada `anonymized_at` — cada entidade carrega um marker detectável inline. Querys de auditoria devem usar os padrões abaixo:

| Entidade | Marker | Consulta SQL |
|----------|--------|--------------|
| WaitlistEntry | `email` começa com `sha256:` | `WHERE email LIKE 'sha256:%'` |
| ContactMessage | `email` começa com `sha256:` + `message = '[anonimizado]'` | `WHERE email LIKE 'sha256:%'` |
| LandingConsent | `ipHash` começa com `anonymized:` | `WHERE ip_hash LIKE 'anonymized:%'` |
| ExportHistory | `status = 'EXPIRED'` + `filters.anonymized = true` + `fileUrl IS NULL` (R-07) | `WHERE status = 'EXPIRED' AND filters ->> 'anonymized' = 'true'` |
| LeadHistory | `oldValue.anonymized = true` e `newValue.anonymized = true` | `WHERE old_value ->> 'anonymized' = 'true'` |

**Timestamp de anonimização:** ExportHistory grava `filters.anonymizedAt` (ISO string) desde R-07. Outras entidades não carregam timestamp explícito — confiar em `AuditLog` com `resource='retention_sweep'` para a data de varrida.

---

## Ajuste manual de retention

```ts
import { setConfig } from '@/lib/services/system-config'
await setConfig('retention.waitlist_entry_days', { value: 180 }, adminUserId)
```

O cache in-memory invalida na próxima hit (TTL 30s). Para aplicar imediatamente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/v1/cron/retention-sweep
```

---

## DSAR (Data Subject Access Request) — procedimento cross-entidade

Quando o titular solicita **acesso** ou **exclusão** (LGPD Art. 18):

### Busca por email/identificador

```sql
-- Waitlist
SELECT * FROM waitlist_entries WHERE email = $1;
-- Contact
SELECT * FROM contact_messages WHERE email = $1;
-- Consent (via ipHash reverso nao e possivel; usar timestamp + userAgent aproximativo)
SELECT * FROM landing_consents ORDER BY created_at DESC LIMIT 100;
-- Leads + History (se usuario registrado)
SELECT l.*, h.* FROM leads l LEFT JOIN lead_history h ON h.lead_id = l.id WHERE l.user_id = (SELECT id FROM user_profiles WHERE email = $1);
-- Export
SELECT * FROM export_history WHERE user_id = (SELECT id FROM user_profiles WHERE email = $1);
```

### Exclusão (Art. 18 VI)

Para titulares **sem** conta — anonimizar imediatamente em todas entidades acima (skip cron, aplicar manualmente). Para titulares **com** conta, usar fluxo `requestAccountDeletion` existente (15 dias janela).

### Comprovante de atendimento

Emitir PDF com:
- Entidades encontradas (ou "nenhum dado") + contagens.
- Ações tomadas (acesso fornecido / anonimização aplicada).
- Timestamp + operador (nome do admin).
- Armazenar em `AuditLog` com `resource='dsar_response'`.

---

## Drill trimestral

A cada 90 dias:
1. Rodar retention sweep em preview/staging.
2. Comparar counts com expectativa.
3. Spot-check: 10 rows por entidade — confirmar PII de fato anonimizada.
4. Registrar em seção "Histórico de drills" abaixo.

### Histórico de drills

| Data | Responsável | Entidades | Counts | Notas |
|------|-------------|-----------|--------|-------|
| (preencher) | | | | |

---

## Arquivos relacionados

- `src/lib/workers/retention-sweeper.ts`
- `src/app/api/v1/cron/retention-sweep/route.ts`
- `src/lib/services/system-config.ts` — DEFAULTS e chaves.
- `src/app/api/v1/cron/retention-cleanup/route.ts` — fluxo Art.18 (deletion request de usuários).
- `docs/lgpd-deletion-policy.md` — política geral LGPD.
- INTAKE §2.13 LGPD.
