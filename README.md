# Lead Hunting Engine

Plataforma que prospecta, qualifica e prioriza leads comerciais automaticamente, combinando coleta de dados de múltiplos provedores externos (Google Places, Outscraper, Apify), inteligência de deduplicação e enriquecimento, scoring configurável e geração de mensagens de abordagem por LLM (Anthropic + OpenAI fallback).

Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Prisma · Supabase (Auth + Postgres + RLS) · trigger.dev v3 · Anthropic / OpenAI · Vercel.

---

## Para começar

### Pré-requisitos

- Node.js ≥ 20
- npm ≥ 10
- Acesso a um projeto Supabase (Postgres + Auth)
- Variáveis de ambiente preenchidas em `.env.local` (consultar `.env.example`)

### Instalação local

```bash
npm install
cp .env.example .env.local           # preencher os valores antes de rodar
npx prisma migrate deploy             # aplica migrations no Postgres configurado
npm run dev                           # http://localhost:3000
```

### Build e validação

```bash
npm run build         # build de produção
npx tsc --noEmit      # type-check estrito
npm run lint          # ESLint
npm test              # suite Jest (unit + integração)
npm run smoke         # smoke test E2E ponta-a-ponta (Playwright)
```

---

## Quem usa o sistema e como

O Lead Hunting Engine tem dois perfis principais:

- **ADMIN** — quem configura o sistema (credenciais de API dos provedores, regras de scoring, convites de operadores).
- **OPERATOR** — quem usa o sistema no dia a dia (dispara coletas, analisa leads, gera pitches, exporta planilhas).

Ambos entram via *magic link* (link enviado por e-mail) e têm acesso controlado por convite. Para o passo-a-passo completo (cadastrar primeiro admin, configurar primeira credencial Google Places, disparar primeira coleta, gerar primeiro pitch, exportar primeiros leads, exercer direito LGPD de portabilidade), consulte o [MANUAL.md](MANUAL.md).

---

## Endpoints operacionais

| Endpoint | Finalidade |
|----------|-----------|
| `GET /api/health` | Healthcheck do banco (`SELECT 1`) |
| `GET /api/health?service=supabase` | Healthcheck do Supabase Auth |
| `GET /api/v1/profile/data-export` | LGPD Art. 18 V — portabilidade de dados (1 export/hora/user) |

Cron jobs configurados em `vercel.json`:

| Path | Schedule |
|------|----------|
| `/api/v1/cron/retention-cleanup` | diário 03:00 |
| `/api/v1/cron/credential-check` | diário 04:00 |
| `/api/v1/cron/check-alerts` | a cada 5 min |
| `/api/cron/drain-local-queue` | a cada 2 min |
| `/api/v1/cron/retention-sweep` | diário 05:00 |

---

## Documentação técnica

| Tópico | Arquivo |
|--------|---------|
| Manual do operador / admin (passo-a-passo) | [MANUAL.md](MANUAL.md) |
| Autenticação e RBAC | [docs/auth.md](docs/auth.md) |
| Validação RLS (Supabase) | [docs/rls-validation.md](docs/rls-validation.md) |
| Setup Supabase | [docs/supabase-setup.md](docs/supabase-setup.md) |
| Setup Vercel (deploy) | [docs/vercel-setup.md](docs/vercel-setup.md) |
| Tokens de design | [docs/design-tokens.md](docs/design-tokens.md) |
| Catálogo de erros | [docs/error-catalog.md](docs/error-catalog.md) |
| Política de exclusão LGPD | [docs/lgpd-deletion-policy.md](docs/lgpd-deletion-policy.md) |
| Pesos do scoring | [docs/scoring-weight-mapping.md](docs/scoring-weight-mapping.md) |
| Runbook — coleta de scrapers | [docs/runbooks/scraper-collection.md](docs/runbooks/scraper-collection.md) |
| Runbook — backup e PITR | [docs/runbooks/backup-restore-pitr.md](docs/runbooks/backup-restore-pitr.md) |
| Runbook — incident response | [docs/runbooks/incident-response.md](docs/runbooks/incident-response.md) |
| Runbook — retention LGPD | [docs/runbooks/lgpd-retention.md](docs/runbooks/lgpd-retention.md) |
| Runbook — rollback de migrations | [docs/runbooks/migrations-rollback.md](docs/runbooks/migrations-rollback.md) |
| Runbook — audit log append-only | [docs/runbooks/audit-log-append-only.md](docs/runbooks/audit-log-append-only.md) |
| Pendências operacionais conhecidas | [PENDING-ACTIONS.md](PENDING-ACTIONS.md) |

---

## Suporte

Bugs, dúvidas operacionais ou pedido de novo acesso: contatar o ADMIN do workspace ou abrir issue no repositório do projeto.
