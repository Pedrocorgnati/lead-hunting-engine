# Runbook — Coleta Multi-Provedor (module-10)

> Operacao do scraper de leads. Cobre disparo, monitoramento, troubleshooting e recuperacao.
>
> Modulo de origem: `module-10-scraper-worker` ([OVERVIEW](../../../../wbs/lead-hunting-engine/modules/module-10-scraper-worker/OVERVIEW.md)).
> Promessa de negocio: BUDGET.md milestone-8 — "Motor de Coleta Multi-Provedor" (R$ 2.255,78).
>
> **Nota:** os links em "Referencias" (final do doc) apontam para artefatos fora do workspace deployado (`output/wbs/`, `output/docs/lead-hunting-engine/`). Resolvem apenas no monorepo de desenvolvimento. Em producao, este runbook e auto-suficiente — leia somente as secoes 1 a 7.

---

## Visao Geral

| Componente | Implementacao |
|------------|---------------|
| Worker | `trigger/tasks/collect-leads.ts` (Trigger.dev v3) |
| Provedores | Google Places → Outscraper → Apify (cascata de fallback) |
| Site Analyzer | `src/lib/workers/providers/site-analyzer.ts` (paralelo durante enriquecimento de URL) |
| Rate Limiter | `src/lib/workers/utils/rate-limiter.ts` (10/3/5/5/5 req/s por provider) |
| Retry | `src/lib/workers/utils/retry-backoff.ts` (exponential + jitter, 429/503/timeout) |
| Credenciais | AES-256-GCM via `getApiKey` — SEC-012 |
| Persistencia | `RawLeadData` + `CollectionJob` (Prisma + Postgres) |

**Nota sobre paralelismo:** o BUDGET descreve "provedores em paralelo". A implementacao usa **cascata de fallback** (Google → Outscraper → Apify) por economia de quota e prevencao de duplicatas no nivel raw. Site Analyzer SIM roda em paralelo durante a fase de enriquecimento de URL. Decisao registrada em REMEDIATION-M8-G04 e RELEASE-NOTES-MILESTONE-8.

---

## 1. Disparar uma coleta

### Via UI (operador)

1. Login em `/admin/scrapers`
2. Clicar em **Nova Coleta**
3. Preencher:
   - **Categoria** (ex: "pizzaria", "advogado")
   - **Cidade** (ex: "Sao Paulo, SP")
   - **Max Results** (default 100, max 500 — clamp `Limits.MAX_COLLECTION_SIZE`)
4. Confirmar — job criado em `PENDING` e enfileirado no Trigger.dev

### Via API (QA / scripts internos)

```bash
curl -X POST $BASE/api/v1/admin/scrapers/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizzaria",
    "location": "Sao Paulo, SP",
    "maxResults": 100
  }'
```

Retorno: `{ "jobId": "<uuid>", "status": "PENDING" }`.

---

## 2. Acompanhar progresso

### Tabela `CollectionJob`

| Campo | Significado |
|-------|-------------|
| `id` | UUID do job |
| `status` | `PENDING` → `RUNNING` → `COMPLETED` / `FAILED` |
| `processedLeads` | Quantos leads ja foram persistidos em `RawLeadData` |
| `totalEstimated` | Estimativa de total (vem do provider, pode ser `null`) |
| `currentSource` | Provider ativo agora (`google-places`, `outscraper`, `apify`) |
| `progress` | Percentual 0-100 |
| `triggerId` | ID do run no Trigger.dev (link direto pra logs) |
| `errorMessage` | Mensagem em caso de `FAILED` |
| `startedAt` / `completedAt` | Timestamps |

### Query SQL rapida

```sql
SELECT
  id,
  status,
  "processedLeads",
  "totalEstimated",
  "currentSource",
  progress,
  "errorMessage",
  "startedAt",
  "completedAt"
FROM "CollectionJob"
WHERE id = '<jobId>';
```

### Dashboard Trigger.dev

- URL: `https://cloud.trigger.dev/orgs/<org>/projects/<proj>/runs`
- Filtrar por `taskId: collect-leads`
- Cada job persiste `triggerId` em `CollectionJob` para link direto

### Smoke test antes de deploy

```bash
npm run test:smoke
```

(Atualmente cobre testes unitarios do orquestrador via `runCollection`. Smoke test E2E completo com banco real depende de seed `bun run seed:test` e fixtures de provider — ver M8-G01 em `docs/PENDING-ACTIONS.md`.)

---

## 3. Troubleshooting

### 3.1 Job travado em `RUNNING` ha mais de 10 minutos

**Sintomas:** `processedLeads` parou de avancar; `currentSource` nao muda; logs do Trigger.dev mostram run em RUNNING sem novos eventos.

**Diagnostico:**
1. Abrir o run no dashboard Trigger.dev (`triggerId` da tabela `CollectionJob`)
2. Verificar se ha exception silenciosa no log do worker
3. Verificar se o provider esta respondendo: `curl -I https://maps.googleapis.com/maps/api/place/textsearch/json?key=$KEY&query=test`

**Acao corretiva:**
1. Forcar transicao manual:
   ```sql
   UPDATE "CollectionJob"
   SET status = 'FAILED',
       "errorMessage" = 'manual abort: stuck in RUNNING > 10min',
       "completedAt" = NOW()
   WHERE id = '<jobId>';
   ```
2. Re-disparar com mesmo payload (ate milestone-9 introduzir checkpointing, recuperacao de progresso parcial nao e suportada — re-run comeca do zero)

### 3.2 HTTP 429 sustentado em um provedor

**Sintomas:** `retry-backoff` retentando varias vezes; throughput caiu drasticamente; logs mostram repetidos `429 Too Many Requests`.

**Diagnostico:**
1. Verificar limites configurados em `src/lib/workers/utils/rate-limiter.ts` (`PROVIDER_LIMITS`)
2. Comparar com a quota real do plano contratado (Google Places = 10 req/s, Outscraper = 3, Apify = 5)
3. Confirmar se ha jobs concorrentes consumindo a mesma quota

**Acao corretiva:**
- Reduzir `PROVIDER_LIMITS` do provider afetado em 50% e redeployar
- Cascata desligara automaticamente o provider problematico apos 3 retries permanentes (cai para o proximo na ordem)
- Se o problema for quota total esgotada do dia: aguardar reset (geralmente 24h UTC para Google) ou aumentar plano

### 3.3 Credencial expirada (HTTP 401 / 403 do provedor)

**Sintomas:** `errorMessage` no `CollectionJob` mencionando `REQUEST_DENIED`, `Unauthorized`, ou `Invalid API key`.

**Diagnostico:**
- Logs do Trigger.dev mostrarao a mensagem exata do provider
- `getApiKey('<provider>')` decriptografa a credencial em runtime — credencial vem de `ApiCredential` (encrypted)

**Acao corretiva:**
1. Admin acessa `/admin/config/credentials/<provider>` (provider entre `google-places`, `outscraper`, `apify`, `here-maps`, `tomtom`)
2. Atualiza chave — sera re-encriptada via `CryptoUtil` (AES-256-GCM)
3. Re-disparar job — `getApiKey()` le do banco em runtime, nao requer redeploy
4. Validar gravando-se um `INSERT INTO "AuditLog"` e verificando que a chave nao aparece em logs

### 3.4 Apify polling 60-iter terminal stop

**Sintomas:** `errorMessage` = `"Apify: timeout aguardando conclusão do run"`. Aconteceu apos ~5min de polling (60 iter * 5s).

**Diagnostico:**
- Run do Apify excedeu 5 minutos sem mudar para `SUCCEEDED` ou `FAILED`
- Causas comuns:
  - Actor lento (`compass/crawler-google-places` em queries pesadas)
  - Input invalido fazendo o actor crashar antes de reportar erro
  - Apify dashboard com problemas de infra

**Acao corretiva:**
1. Abrir run no Apify dashboard pelo `runId` (logado via `logger.info('Apify run started', { runId })`)
2. Se actor crashou: corrigir input (geralmente `query` muito longo ou `location` mal formatado)
3. Se actor esta lento: reduzir `maxResults` ou trocar para outro provider via override
4. Re-disparar — guardrail de 60 iteracoes evita worker preso indefinidamente

---

## 4. Recuperacao de falha parcial

> **Limitacao MVP M8:** jobs em `FAILED` com `processedLeads > 0` deixam dados parciais em `RawLeadData`. Re-disparar com mesmo `query`/`location` faz upsert por `externalId` — leads ja salvos sao preservados; novos sao adicionados.
>
> **milestone-9** (Pipeline de Coleta e Orquestracao) introduz **checkpointing explicito** com retomada do ponto exato de falha. Ate la, a recuperacao e implicita (via upsert + idempotencia).

---

## 5. Pre-deploy checklist (operacional)

- [ ] `npm run test` passa
- [ ] `npm run test:smoke` passa
- [ ] `npm run build` sem erros
- [ ] `npx tsc --noEmit` zero erros
- [ ] Credenciais validas em `ApiCredential` para todos os providers ativos (verificar via `/admin/config/credentials`)
- [ ] Quota dos providers checada no dashboard de cada um
- [ ] `CollectionJob` schema atualizado se houve migration (`prisma migrate status`)
- [ ] Trigger.dev project deployado (`npx trigger.dev@latest deploy`)

---

## 6. Limites e numeros conhecidos

| Limite | Valor | Onde |
|--------|-------|------|
| Max leads por job | 500 | `Limits.MAX_COLLECTION_SIZE` |
| Polling Apify | 60 iter * 5s = 5min | `apify.ts:41` |
| Rate limit Google Places | 10 req/s | `rate-limiter.ts` PROVIDER_LIMITS |
| Rate limit Outscraper | 3 req/s | `rate-limiter.ts` PROVIDER_LIMITS |
| Rate limit Apify | 5 req/s | `rate-limiter.ts` PROVIDER_LIMITS |
| Retry max attempts | 3 | `retry-backoff.ts` |
| Trigger.dev maxDuration | 300s (5min) | `trigger.config.ts` |
| Site analyzer timeout | 5s | `site-analyzer.ts` AbortController |

---

## 7. Referencias

- [TASK-5 — Orquestrador `collect-leads`](../../../../wbs/lead-hunting-engine/modules/module-10-scraper-worker/TASK-5.md)
- [TASK-9 — Smoke + orquestrador tests](../../../../wbs/lead-hunting-engine/modules/module-10-scraper-worker/TASK-9.md)
- [MODULE-REVIEW — auditoria 2026-03-23](../../../../wbs/lead-hunting-engine/modules/module-10-scraper-worker/MODULE-REVIEW.md)
- [MILESTONE-8 — contrato de entrega](../../../../docs/lead-hunting-engine/delivery/MILESTONE-8.md)
- [BUDGET.md — milestone-8 R$ 2.255,78](../../../../docs/lead-hunting-engine/BUDGET.md)
- Runbooks irmaos: [audit-log](./audit-log-append-only.md) · [incident-response](./incident-response.md) · [lgpd-retention](./lgpd-retention.md) · [migrations-rollback](./migrations-rollback.md)
