# Runbook — Rollback de Migrations

**Escopo:** reverter um conjunto de migrations Prisma em produção ou staging sem comprometer dados.
**Severidade padrão:** SEV2 (impacto em release). Se a migration causou corrupção, escalar para SEV1.
**Ferramenta:** `scripts/db-rollback.sh`.

---

## Pré-checklist (SEMPRE antes do rollback)

- [ ] Confirmar o motivo do rollback (bug identificado? perda de dados? schema incompatível com código antigo?).
- [ ] Ter acesso a `DATABASE_URL` do ambiente-alvo (nunca executar com `.env.local` apontando para prod sem dupla checagem).
- [ ] Decidir se o app precisa ser posto em `MAINTENANCE_MODE=true` (TASK-19) enquanto rolba. Para rollback envolvendo DROP/rename de coluna: **SIM, ponha em manutenção antes**.
- [ ] Identificar quantas migrations reverter (`--steps N`). Padrão: 1.
- [ ] Comunicar janela no canal `#ops` e status page.

---

## Cenário 1 — Supabase managed (produção)

Supabase não expõe `pg_dump` direto; o rollback reverte somente o registro Prisma. Para restaurar o schema/dados, use PITR (veja `backup-restore-pitr.md`).

### Procedimento

1. **Dry-run** para validar o que será feito:
   ```bash
   DATABASE_URL="$SUPABASE_DB_URL" ./scripts/db-rollback.sh --steps 1 --dry-run
   ```
2. **Restore PITR** via Dashboard ou CLI — escolha timestamp **imediatamente anterior** ao deploy da migration:
   ```bash
   supabase db backups restore \
     --project-ref <PROJECT_REF> \
     --timestamp "2026-04-24T14:30:00Z"
   ```
   Aguarde status "restored" (pode levar 3–15min).
3. **Sincronizar registro Prisma** com o schema restaurado:
   ```bash
   DATABASE_URL="$SUPABASE_DB_URL" ./scripts/db-rollback.sh --steps 1
   # ou manualmente:
   npx prisma migrate resolve --rolled-back <migration_name>
   ```
4. **Redeploy** do app com a versão anterior à migration (git tag ou Vercel promote).
5. **Validar:** rodar smoke tests (`/post-deploy-verify`) e desligar `MAINTENANCE_MODE`.

### Limitações conhecidas

- PITR tem janela fixa (7d Pro, 14d Team). Fora dela, use backup diário logical.
- Restore substitui **todo o banco**; escritas concorrentes durante a restore são perdidas.

---

## Cenário 2 — Postgres direto (staging/local)

### Procedimento

1. **Backup explícito** antes de qualquer coisa:
   ```bash
   DATABASE_URL="$STAGING_DB_URL" BACKUP_DIR=./backups \
     ./scripts/db-rollback.sh --steps 1 --dry-run
   ```
2. Confirmar que o dry-run lista as migrations corretas. Executar real:
   ```bash
   DATABASE_URL="$STAGING_DB_URL" ./scripts/db-rollback.sh --steps 1
   ```
   O script faz `pg_dump` em `./backups/backup-YYYYMMDDHHMMSS.sql` e marca a(s) migration(s) como `rolled-back`.
3. **Restore do schema**: Prisma não gera down migration. Duas opções:
   - **Opção A (mais seguro):** `psql "$DATABASE_URL" < backups/backup-<timestamp>.sql` — restaura 100%.
   - **Opção B (cirúrgico):** criar migration compensatória:
     ```bash
     npx prisma migrate dev --name revert_<feature> --create-only
     # editar SQL manualmente para DROP/ALTER
     npx prisma migrate deploy
     ```
4. **Validar consistência:**
   - `prisma migrate status` deve listar as migrations revertidas como não aplicadas.
   - Rodar suite de integração: `npm run test:integration`.
5. **Reversão do reversão** (se algo der errado durante o rollback):
   - Restore do backup gerado no passo 2: `psql "$DATABASE_URL" < backups/backup-<timestamp>.sql`
   - `npx prisma migrate resolve --applied <migration>` para remarcar como aplicada.

---

## Pós-rollback

- [ ] Abrir issue com RCA da migration problemática.
- [ ] Anexar ao postmortem: `backups/backup-*.sql`, logs do script, screenshots do status.
- [ ] Atualizar este runbook se algo novo for aprendido.

---

## Arquivos relacionados

- `scripts/db-rollback.sh` — executor.
- `docs/runbooks/backup-restore-pitr.md` — PITR Supabase.
- `docs/runbooks/incident-response.md` — framework geral de incidente.
