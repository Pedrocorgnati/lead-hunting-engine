# Runbook — Incident Response (SRE)

**Escopo:** playbook para detecção, triage, mitigação e postmortem de incidentes em produção.
**Referência:** framework SRE (Google SRE Book cap.14) adaptado para equipe pequena.

---

## Severity classification

| Sev | Definição | Exemplos | SLA response | SLA mitigation |
|-----|-----------|----------|--------------|----------------|
| **SEV1** | Outage total, perda de dados, exposição de PII, breach | Site fora, DB down, dump de credenciais vazado | ≤5min | ≤1h |
| **SEV2** | Feature crítica fora, degradação ampla, release bloqueado | Export não gera, login quebrado para parcela, coleta não roda | ≤15min | ≤4h |
| **SEV3** | Bug impactante sem bloquear receita; workaround existe | Métrica do admin errada, notificação atrasada | ≤1h | ≤24h |
| **SEV4** | Bug cosmético, edge case, tech debt | Typo, layout quebrado em browser antigo | ≤1 dia útil | ≤1 semana |

---

## Fase 1 — Detection

Fontes de detecção (ordem de prioridade):

1. **Sentry** — alertas críticos configurados em `docs/runbooks/*` via project Sentry do `lead-hunting-engine`.
2. **Uptime** — check externo a `/api/health` a cada 60s.
3. **Alertas internos** — `/api/v1/cron/check-alerts` dispara `SentAlert` em llm-threshold / stuck-jobs / api-daily (TASK-13 ST003).
4. **User report** — email `suporte@...`, canal status page.
5. **Oncall sweep** — operador verificando dashboards `/admin/metricas`.

**Ao detectar:** criar thread em `#incidents` com template:

```
🚨 INC-YYYYMMDD-NN — <título curto>
Sev: SEV?
Detectado por: <fonte>
Sintoma: <1 linha>
Owner: <@nome>
Status page: <link>
```

---

## Fase 2 — Triage

1. **Owner:** primeira pessoa a responder assume. Não há "passagem" durante triage.
2. **Comm channel:** thread no `#incidents` é a fonte canônica. Zero DM.
3. **Status page:** publicar nota inicial em ≤5min para SEV1/SEV2 ("investigando").
4. **Scope:**
   - Quantos usuários afetados? (contar via `prisma.auditLog` ou Sentry tags).
   - Dados perdidos? Se SIM → escalar para SEV1 automaticamente.
   - Receita impactada? (coleta/export/billing).

### Decisão binária: mitigar ou investigar?

| Situação | Decisão |
|----------|---------|
| Deploy recente (<1h) coincide com início do incidente | **Rollback primeiro**, RCA depois |
| Incidente estável (não piora) e mitigação não-óbvia | Investigar em paralelo; feature flag se aplicável |
| Degradação progressiva | Mitigar imediato (flag, rate-limit global, manutenção) |

---

## Fase 3 — Mitigation

### Toolbox

| Ação | Comando / ferramenta | Quando |
|------|----------------------|--------|
| **Rollback Vercel** | Dashboard → Deployments → "Promote to Production" em deploy anterior | Regressão pós-deploy |
| **Rollback migration** | `scripts/db-rollback.sh` | Schema-related |
| **Maintenance mode** | `vercel env add MAINTENANCE_MODE=true` + redeploy | Proteger DB/downstream |
| **Feature flag** | Flags em `SystemConfig` via `/admin/config` | Desligar feature específica |
| **PITR restore** | `docs/runbooks/backup-restore-pitr.md` | Corrupção/exclusão de dados |
| **Rate-limit global** | Env `RATE_LIMIT_GLOBAL_RPS=<N>` em middleware | Overload, DDoS suave |
| **Scale up** | Dashboard → Functions → Max Duration / Memory | Degradação por carga |

### Comunicação

- Atualização **a cada 15min** para SEV1, **a cada 30min** para SEV2.
- Copy template status page:
  > "Identificamos problema em \<feature\> afetando \<escopo\>. Equipe está mitigando. Próxima atualização em \<horário\>."

---

## Fase 4 — Postmortem

**Prazo:** ≤5 dias úteis após resolução.
**Quem escreve:** owner do incidente.
**Revisão:** equipe técnica + leads de produto.

### Template

```markdown
# Postmortem — INC-YYYYMMDD-NN <título>

**Data:** 2026-MM-DD  
**Severity:** SEV?  
**Duração:** HH:MM (início) → HH:MM (mitigação) → HH:MM (resolução final)  
**Owner:** @nome  
**Escrito em:** 2026-MM-DD

## Sumário executivo

<3 linhas. Quem foi afetado, o que quebrou, como foi resolvido.>

## Impacto

- Usuários afetados: N
- Receita impactada: R$ X (se aplicável)
- SLA breach: sim/não
- Dados perdidos: sim/não

## Timeline (UTC)

- HH:MM — <fonte> detecta <sintoma>
- HH:MM — oncall @nome entra no incidente
- HH:MM — hipótese X descartada porque Y
- HH:MM — mitigação Z aplicada
- HH:MM — métricas voltam ao normal

## Root cause

<Análise técnica. Seja específico: arquivo, linha, commit, PR. Evite "erro humano" sem contexto — descreva qual gatilho o sistema deixou disponível.>

## O que funcionou

- <alertas dispararam em <tempo>>
- <rollback levou <X>min>

## O que não funcionou

- <alerta veio tarde demais>
- <runbook desatualizado na seção X>

## Action items

| # | Ação | Owner | Due date | Prioridade |
|---|------|-------|----------|-----------|
| 1 | <específico, acionável> | @nome | 2026-MM-DD | P0/P1/P2 |

## Aprendizados

<1-3 bullets. Foco em sistemas, não em pessoas.>
```

---

## Oncall rotation

- **Atualmente:** owner solo (Pedro). Em caso de ausência planejada, avisar com 24h em `#ops`.
- **Futuro:** PagerDuty/Opsgenie com rotação semanal quando houver ≥3 engenheiros.

---

## Ferramental

| Ferramenta | URL / comando |
|-----------|---------------|
| Sentry | https://sentry.io (projeto `lead-hunting-engine`) |
| Logs Vercel | Dashboard → Logs → Filters por deployment |
| Database | `psql "$DATABASE_URL"` ou Supabase Studio |
| Feature flags | `/admin/config/alerts` |
| Status page | (provisionar — PENDING-ACTIONS) |

---

## Arquivos relacionados

- `docs/runbooks/migrations-rollback.md`
- `docs/runbooks/backup-restore-pitr.md`
- `docs/runbooks/audit-log-append-only.md`
- `scripts/db-rollback.sh`
