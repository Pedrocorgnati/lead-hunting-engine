# Pending Actions — Lead Hunting Engine

Acoes manuais pendentes (configuracoes, credenciais, infraestrutura) necessarias
para que features fiquem 100% operacionais.

---

## TASK-11 providers secundarios

Providers implementados como stub por dependerem de infraestrutura / credenciais
externas ainda nao provisionadas.

| Provider | Status | Dependencia | Env / Flag |
|----------|--------|-------------|------------|
| **IBGE** (`src/lib/workers/providers/ibge.ts`) | OK — API publica | Nenhuma | `IBGE_API_BASE` opcional |
| **Google My Business** (`src/lib/workers/providers/google-my-business.ts`) | Stub se sem chave | Google Places API | `GOOGLE_PLACES_API_KEY` |
| **TripAdvisor** (`src/lib/workers/providers/tripadvisor.ts`) | Stub se sem chave | TripAdvisor Content API (paga) | `TRIPADVISOR_API_KEY` |
| **Reclame Aqui** (`src/lib/workers/providers/reclame-aqui.ts`) | Stub | Playwright + anti-bot (Cloudflare) | `RECLAME_AQUI_ENABLED=true` + headless infra |
| **Sintegra** (`src/lib/workers/providers/sintegra.ts`) | Stub | Playwright + captcha solver por UF | `SINTEGRA_ENABLED=true` + headless infra |

### Para ativar cada provider

1. **Google My Business**
   - Habilitar a API "Places API" no Google Cloud Console.
   - Gerar chave restrita a referer do servidor.
   - Setar `GOOGLE_PLACES_API_KEY` em `.env`/Vercel.

2. **TripAdvisor**
   - Contratar plano do TripAdvisor Content API (https://developer-tripadvisor.com).
   - Setar `TRIPADVISOR_API_KEY` em `.env`.
   - Opcional: `TRIPADVISOR_API_BASE` se endpoint regional diferente.

3. **Reclame Aqui**
   - Provisionar worker com Playwright (ja existente em `src/lib/workers/providers/headless-scraper.ts`).
   - Implementar scraping em `queryReclameAqui` (stub atual).
   - Resolver protecao Cloudflare (residencial proxy + TLS fingerprinting).
   - Setar `RECLAME_AQUI_ENABLED=true` em `.env`.

4. **Sintegra**
   - Cada UF tem site proprio com captcha distinto.
   - Provisionar captcha solver (ex: 2captcha, anti-captcha).
   - Implementar driver por UF em `querySintegra` (stub atual).
   - Setar `SINTEGRA_ENABLED=true` em `.env`.

### Notas

- Todos os providers retornam `null` silenciosamente quando desabilitados,
  sem bloquear o pipeline de enriquecimento.
- Registro central em `src/lib/workers/providers/provider-manager.ts` via
  `SECONDARY_PROVIDERS` + `isSecondaryProviderEnabled()`.

---

## Milestone 1 — Pendencias Pos-Remediacao /delivery:create-tasks (2026-04-24)

| # | Gap | Acao Manual | Bloqueia |
|---|-----|-------------|----------|
| G-001 | `.env` vazio | `cp .env.example .env` e preencher Supabase URL/anon/service_role/DATABASE_URL/DIRECT_URL (ver `.env.example` para instrucoes) | health-check, migrations, seeds, build com Prisma |
| G-005 | Migrations nao aplicadas | Apos G-001: `npx prisma migrate deploy` + aplicar `prisma/rls-policies.sql` via Supabase SQL Editor + `npm run seed:dev` | Dashboard, list endpoints, /api/health DB check |
| G-006 | Lighthouse baseline | Apos app rodando: `npm run build && npm start &` e `npx lhci autorun` | Sign-off criterio 4.4 |
| G-007 | A11y audit | Rodar axe-core em `/login`, `/dashboard` via Playwright | Sign-off criterio US-017 |
| G-008 | 17 lint errors pre-existentes | Rework de componentes (hooks rules/set-state-in-effect) — requer analise caso-a-caso; escopo de milestone downstream | CI lint strict |
| G-010 | `npx prisma validate` | Apos G-001 | Documentacao smoke |
| G-013 | Security headers smoke | Apos app rodando: `curl -I http://localhost:3000/` + grep dos headers esperados | Sign-off criterio 7 |

## Onda P2/P3 (intake-review) — 2026-04-24

| # | Gap | Acao Manual | Bloqueia |
|---|-----|-------------|----------|
| G-CL079-REDIS | Copy-token store multi-instance | Provisionar Upstash Redis + trocar `src/lib/security/copy-token-store.ts` por driver Redis quando deploy escalar para multiplas instancias. Hoje: single-instance funciona com store em memoria | Nao — deploy single-instance ok |
| G-TASK20-WORKER-HB | Worker heartbeat file | Implementar writer `/tmp/worker-heartbeat` (touch a cada 30s) no processo worker. HEALTHCHECK do Dockerfile.workers depende disso | Docker workers health=healthy |
| G-TASK20-DRILL | DR drill trimestral | Restore PITR em projeto sandbox; registrar RTO em `docs/runbooks/backup-restore-pitr.md` | SRE maturity |
| G-TASK21-VISUAL | Screenshots 10 paginas + axe-core | Rodar Playwright+axe nas 10 paginas listadas em `docs/design-tokens.md`, anexar antes/depois | Criterio de aceite TASK-21 |
| G-TASK19-MAINT-TEST | Smoke MAINTENANCE_MODE | Setar `MAINTENANCE_MODE=true` em preview, confirmar 503 + Retry-After + banner offline ao forcar offline no devtools | Criterio TASK-19 |
| G-TASK18-NOTES-UI | Refactor NoteAddForm -> ContactEvent | Trocar `NoteAddForm` textarea livre por form com selects canal/resultado + note opcional; consumir POST /api/v1/leads/[id]/contact-events. `Lead.notes` continua compat legacy | UX CL-283 100% |
| G-TASK17-AUTH-SESSIONS-RLS | Policy RLS auth.sessions | Revisar RLS do schema `auth.sessions` para permitir `SELECT` via service_role nos proprios user_sessions. Sem isso, /settings/sessions retorna lista vazia silenciosamente | UX sessoes |
| G-TASK15-CRON-SECRET | CRON_SECRET env | Provisionar `CRON_SECRET` (32+ chars) em Vercel env. Necessario para /api/cron/drain-local-queue e /api/v1/cron/retention-sweep autorizarem | Crons ativos em prod |
| G-TASK15-HANDLERS | Registrar novos kinds local-queue | Cada novo tipo de job que usa `dispatchJob()` precisa registrar handler em `HANDLERS` map de `/api/cron/drain-local-queue/route.ts` | Fila processa outros tipos |
| G-TASK26-SWEEP-DRY-RUN | Dry-run retention sweep staging | Rodar curl ao /api/v1/cron/retention-sweep em staging, conferir counts por entidade + spot-check 10 rows PII anonimizada | Ativar em prod |

## Codex Review Residuais — sess-20260424-p2p3-wave-review (2026-04-24)

Findings do `/skill:mcp-codex` Level 2 (senior-qa-architect + senior-adversarial). Risk rating GLOBAL revisto: **low-med** apos resolucao (13/15 fechadas). Restam 2 itens ops (require browser/preview).

### Status final

| # | Acao | Sev | Status | Resolucao |
|---|------|-----|--------|-----------|
| — | **CRITICAL**: precedencia SQL `listUserSessions` (cross-user leak) | critical | **RESOLVIDO** | Parenteses `(not_after IS NULL OR not_after > NOW())` + log estruturado em `sessions.ts:37-55` |
| R-01 | Teste integracao sessions (cross-user leak regression, 409, 404, RLS fallback) | critical | **RESOLVIDO** | `src/lib/supabase/__tests__/sessions.test.ts` — 5 tests pass |
| R-02 | CL-311: dispatch admin em `/api/v1/contact` | high | **RESOLVIDO** | `CONTACT_MESSAGE_RECEIVED` event + `notifyAdmins()` helper + wire no endpoint; comentario ajustado |
| R-03 | Fluxo canonico de notas — `NotesEditor` vs `ContactEvent` | high | **RESOLVIDO** | Novo componente `ContactEventForm.tsx` (canal+resultado+note) integrado em `/leads/[id]`; NotesEditor permanece para nota unica do lead (escopo diferente) |
| R-04 | Testes retention-sweeper | high | **RESOLVIDO** | `src/lib/workers/__tests__/retention-sweeper.test.ts` — 8 tests pass (cada entidade + runRetentionSweep + partial-failure) |
| R-05 | Testes copy-token | high | **RESOLVIDO** | `src/lib/security/__tests__/copy-token-store.test.ts` — 8 tests pass (TTL, one-shot, quota per-actor, quota recycling) |
| R-06 | Bound operacional `copy-token-store.ts` | high | **RESOLVIDO** | `MAX_TOKENS_PER_ACTOR=20` + `MAX_STORE_SIZE=10_000` + `CopyTokenQuotaExceededError` + endpoint 429 |
| R-07 | LGPD: `anonymized_at` marker + `fileUrl` cleanup em ExportHistory | high | **RESOLVIDO** | Sweeper grava `filters.anonymizedAt` ISO + zera `fileUrl`; runbook alinhado com sintaxe dos markers canonicos por entidade |
| R-08 | Smoke `MAINTENANCE_MODE=true` preview | high | **PENDENTE OPS** | Requer ambiente preview com vercel deploy — AI gerou testes unit de middleware (9 pass), mas smoke real precisa env manual |
| R-09 | Testes landing (honeypot/same-origin/LGPD) | med | **RESOLVIDO** | `src/app/api/v1/__tests__/contact.route.test.ts` — 9 tests pass (honeypot via Zod, fake-200 via time-to-fill, 403 cross-origin, 422 LGPD, 400 email invalido) |
| R-10 | Evento `EXPORT_READY` dedicado | med | **RESOLVIDO** | `export-worker.ts:176` migrado de `JOB_COMPLETED` para `EXPORT_READY` + copy builder + evento em `NOTIFICATION_EVENTS` |
| R-11 | Testes verify-password | med | **RESOLVIDO** | `src/app/api/v1/auth/verify-password/__tests__/route.test.ts` — 6 tests pass (200/401/400/429 user/429 ip) |
| R-12 | Testes SavedView + LeadTag | med | **RESOLVIDO** | `src/app/api/v1/views/__tests__/route.test.ts` (6 tests) + `src/app/api/v1/leads/__tests__/tags.route.test.ts` (11 tests) — todas pass |
| R-13 | Rate-limit IP+account em verify-password | med | **RESOLVIDO** | `limits.authVerifyByIp` (10/min) + aplicado em ordem no endpoint; rejeita credential stuffing horizontal |
| R-14 | Testes middleware | med | **RESOLVIDO** | `src/__tests__/middleware.test.ts` — 9 tests pass (correlation-id injection/preserve/overlong, maintenance gate API 503, page rewrite, exempts) |
| R-15 | WCAG/axe + 10 screenshots TASK-21 | med | **PENDENTE OPS** | Requer Playwright+axe-core em browser runtime — AI nao pode executar |

### Novos artefatos criados nesta rodada

**Código (6 edits):**
- `src/lib/supabase/sessions.ts` — SQL precedence fix + structured log
- `src/lib/security/copy-token-store.ts` — bounds + CopyTokenQuotaExceededError
- `src/app/api/v1/admin/config/credentials/[provider]/copy-token/route.ts` — 429 em quota
- `src/app/api/v1/contact/route.ts` — notifyAdmins fire-and-forget
- `src/app/api/v1/auth/verify-password/route.ts` — dual rate-limit (user+IP)
- `src/lib/rate-limiter.ts` — `limits.authVerifyByIp`
- `src/lib/workers/export-worker.ts` — EXPORT_READY event
- `src/lib/workers/retention-sweeper.ts` — fileUrl=null + anonymizedAt
- `src/lib/notifications/copy.ts` — 2 novos events
- `src/lib/notifications/admin-broadcast.ts` (novo)
- `src/components/leads/ContactEventForm.tsx` (novo)
- `src/app/(app)/leads/[id]/page.tsx` — injeta ContactEventForm
- `src/app/api/v1/leads/[id]/tags/route.ts` — regex unambiguous (comentario)
- `docs/runbooks/lgpd-retention.md` — tabela markers canonicos

**Testes (8 novos arquivos, 53 casos pass):**
- `src/lib/security/__tests__/copy-token-store.test.ts` (8)
- `src/lib/workers/__tests__/retention-sweeper.test.ts` (8)
- `src/lib/supabase/__tests__/sessions.test.ts` (5)
- `src/__tests__/middleware.test.ts` (9)
- `src/app/api/v1/auth/verify-password/__tests__/route.test.ts` (6)
- `src/app/api/v1/views/__tests__/route.test.ts` (6)
- `src/app/api/v1/leads/__tests__/tags.route.test.ts` (11)
- `src/app/api/v1/__tests__/contact.route.test.ts` (9)
- `src/lib/metrics/__tests__/product-metrics.test.ts` — MODIFICADO: mock `auditLog` para acompanhar `getActiveOperators`

### Safety Net atualizado

- **Baseline pre-P2:** 350/352 PASS (2 pre-existing failures)
- **Apos gaplist P0+P1+P2+Codex-resolve:** **416/418 PASS** (+66 tests, 0 regressoes; mesmas 2 falhas pre-existentes em `scoring.test.ts` e `config.service.test.ts`)

**Nota:** acoes cross-ref findings em `.claude/mcp-codex-sessions/sess-20260424-p2p3-wave-review.json` e telemetry em `.claude/mcp-codex-telemetry/sessions.jsonl`.

### Safety Net Report (pos remediacao)
- `npm run type-check`: **0 errors** (era 78)
- `npm run lint`: 17 errors + 47 warnings (era 19 + 46)
- `npm run build`: **FAIL** — `pg` pulled into Client Component bundle (pre-existente; `src/app/(app)/admin/convites/page.tsx` importa `src/services/invite.service.ts` → `src/lib/prisma.ts` → `pg`). Requer mover para Server Component puro ou API route. Nao introduzido pela remediacao.
- `npm test`: **350/352 PASS** (2 pre-existing logic failures em `config.service.test.ts`, `scoring.test.ts`)
