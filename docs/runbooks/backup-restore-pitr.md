# Runbook — Backup e Restore PITR (Supabase)

**Escopo:** restaurar dados de produção em caso de corrupção, exclusão acidental ou migration defeituosa usando Point-In-Time Recovery (PITR) do Supabase.
**Referência oficial:** https://supabase.com/docs/guides/platform/backups

---

## Objetivo

Definir RTO (Recovery Time Objective) e RPO (Recovery Point Objective), janelas disponíveis e procedimento passo-a-passo.

| Métrica | Valor alvo |
|---------|-----------|
| RTO | ≤ 30min (plano Pro); ≤ 15min (Team/Enterprise) |
| RPO | ≤ 5min (janela PITR contínua) |
| Janela PITR | 7 dias (Pro), 14 dias (Team), 30 dias (Enterprise) |
| Backup lógico diário | 7 dias (Pro em diante) |

> **Atenção:** planos Free não têm PITR. Verifique o plano atual em `Dashboard → Project → Settings → Billing`.

---

## Pré-checklist

- [ ] Confirmar que o problema é **reversível via restore** (corrupção/exclusão). Problemas aplicacionais (bug no código) NÃO se resolvem com PITR — rollback de deploy resolve.
- [ ] `MAINTENANCE_MODE=true` (TASK-19) para congelar escritas concorrentes.
- [ ] Identificar **timestamp imediatamente anterior** ao evento problemático (ISO 8601, UTC).
- [ ] Notificar equipe via `#ops` + status page.
- [ ] Ter `SUPABASE_ACCESS_TOKEN` (ORCH; fonte: `.claude/projects/lead-hunting-engine.json > credentials.supabase.access_token`).
- [ ] Confirmar janela PITR disponível (abaixo).

---

## Procedimento

### Opção A — Dashboard (recomendado em SEV1)

1. Abrir `Dashboard → Project → Database → Backups`.
2. Aba **Point in Time Recovery**.
3. Selecionar data e hora alvo (precisão 1s).
4. Clicar **Restore**; confirmar.
5. O projeto entra em status `Restoring` por 3–15min.
6. Após `Ready`, rodar smoke (`/post-deploy-verify`).

### Opção B — CLI (automatizável)

```bash
# Autenticacao
supabase login --access-token "$SUPABASE_ACCESS_TOKEN"

# Listar backups disponiveis
supabase db backups list --project-ref "$SUPABASE_PROJECT_REF"

# Restore PITR (timestamp UTC)
supabase db backups restore \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --timestamp "2026-04-24T14:30:00Z"

# Poll status
supabase projects api-info --project-ref "$SUPABASE_PROJECT_REF"
```

### Opção C — Backup lógico diário (fallback)

Usar quando o evento está **fora da janela PITR** (ex.: corrupção descoberta em D+10 com PITR de 7d):

1. `Dashboard → Project → Database → Backups → Daily Backups`.
2. Download do `.sql.gz` do dia alvo.
3. Restore em **instância nova** (nunca em produção live):
   ```bash
   createdb lead-hunting-restore
   gunzip -c supabase-backup-2026-04-15.sql.gz | psql lead-hunting-restore
   ```
4. Comparar dados, extrair o que interessa, aplicar em produção via `INSERT ... ON CONFLICT`.

---

## Pós-restore

- [ ] Validar registros críticos (contar `User`, `Lead`, `CollectionJob`).
- [ ] Executar `prisma migrate status` — pode haver drift; reconciliar via `migrate resolve`.
- [ ] Verificar se webhooks/cron re-entregaram eventos do período restaurado (risco de duplicação).
- [ ] `MAINTENANCE_MODE=false` e comunicar resolução no `#ops`.
- [ ] Postmortem: RCA, linha do tempo, impacto em RPO real, action items.

---

## Testes periódicos (disaster drill)

- **Trimestral:** restaurar para projeto sandbox; medir RTO real.
- **Registrar resultados** neste runbook (seção "Histórico de drills").

### Histórico de drills

| Data | Responsável | RTO observado | RPO observado | Notas |
|------|-------------|---------------|---------------|-------|
| (preencher) | | | | |

---

## Arquivos relacionados

- `docs/runbooks/migrations-rollback.md` — rollback de schema.
- `docs/runbooks/incident-response.md` — playbook SRE.
- `scripts/db-rollback.sh` — script com branch Supabase-aware.
