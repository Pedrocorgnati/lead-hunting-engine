# Manual do Lead Hunting Engine

Guia operacional voltado a usuários finais (ADMIN e OPERATOR). Para informações de instalação local e endpoints técnicos, ver [README.md](README.md).

---

## Visão geral

O Lead Hunting Engine automatiza a prospecção de leads B2B por nicho/cidade. O ADMIN configura **credenciais externas** (Google Places, Outscraper, Apify) e **regras de scoring**, e o OPERATOR usa o sistema para **disparar coletas**, **revisar leads coletados**, **gerar pitches por LLM** e **exportar planilhas**.

Todos os dados pessoais ficam protegidos por RLS (Supabase) e o usuário pode exercer os direitos LGPD a qualquer momento (portabilidade via DSAR e exclusão de conta).

---

## Acesso e autenticação

1. Acesse a URL pública do sistema (informada pelo ADMIN do workspace).
2. Insira o e-mail cadastrado no convite.
3. Receberá um *magic link* por e-mail. Clique para entrar.
4. No primeiro acesso, completar o **onboarding** (Welcome → Done) e aceitar os termos LGPD.

> Sessões ficam ativas por 7 dias. Você pode encerrar a sessão a qualquer momento via menu do usuário no canto superior direito.

---

## Fluxo do ADMIN

### 1. Convidar um operador
- Menu lateral → **Admin** → **Convites** (`/admin/convites`)
- Informar e-mail e role (`OPERATOR` ou `ADMIN`)
- O convidado recebe e-mail com link de ativação

### 2. Configurar uma credencial de provedor (ex: Google Places)
- Menu lateral → **Admin** → **Credenciais** (`/admin/configuracoes`)
- Selecionar provedor (Google Places, Outscraper, Apify)
- Colar a API key — ela é criptografada com AES-256-GCM no banco e nunca exposta de volta na UI (apenas mascarada)

### 3. Ajustar pesos de scoring
- Menu lateral → **Admin** → **Scoring** (`/admin/scoring`)
- Ajustar os pesos de cada dimensão (relevância, qualidade do dado, sinais de oportunidade)
- A mudança afeta apenas leads coletados a partir do momento (use *recompute score* para reaplicar em leads existentes)

### 4. Acompanhar saúde operacional
- Menu lateral → **Admin** → **Métricas** (`/admin/metricas`)
- Acompanhar: coletas em andamento, custo LLM acumulado, alertas ativos
- Healthcheck público: `/api/health`

---

## Fluxo do OPERATOR

### 1. Disparar uma coleta de leads
- Menu lateral → **Coletas** (`/coletas`)
- Clicar em **Nova Coleta**
- Definir: nicho (CNAE), cidade(s), volume desejado, provedor preferencial
- O job entra na fila do trigger.dev e roda em background. Status: `PENDING → RUNNING → DONE | FAILED`

### 2. Revisar leads coletados
- Menu lateral → **Leads** (`/leads`)
- Aplicar filtros (busca textual, status, temperatura, recência 24h/7d/30d)
- Salvar combinações de filtro como **Saved View** (`SavedViewsBar`)
- Clicar em um lead para abrir o **detalhe** (`/leads/{id}`):
  - **Score Breakdown** — 6 dimensões da pontuação
  - **Provenance Table** — origem de cada dado coletado
  - **Lifecycle Tracker** — timeline de status (Novo → Contatado → Negociando → Convertido / Perdido)
  - **Notas / Tags / Contact Events** — anotações próprias

### 3. Gerar um pitch por LLM
- Na tela de detalhe do lead, clicar em **Gerar Pitch**
- O sistema usa Anthropic (com fallback para OpenAI) e considera o contexto do lead (nicho, dados públicos, tom configurado)
- O pitch fica salvo no histórico do lead e pode ser editado/regenerado

### 4. Atualizar status de um lead
- Na tela de detalhe → seletor de **Status**
- Estados terminais (`CONVERTED`, `DISCARDED`) bloqueiam transições adicionais
- Cada mudança fica auditada em `LeadHistory`

### 5. Exportar planilha
- Menu lateral → **Exportar** (`/exportar`)
- Escolher formato (CSV, JSON, vCard) e escopo (todos, filtro atual, lead único via Budget Flow)
- Limite síncrono: 10k linhas. Acima disso, vai para fila assíncrona — acompanhar em **Histórico de Exportações** (`/exports`)
- Exports não incluem PII excedente (sanitização aplicada por `budgetflow-serializer`)

---

## LGPD — direitos do titular

### Portabilidade (Art. 18 V)
- Endpoint: `GET /api/v1/profile/data-export` (autenticado)
- Retorna JSON com **todos os seus dados pessoais**
- Limite: **1 export por hora por usuário**
- Acessível também via menu do usuário → **Meus dados** → **Exportar dados**

### Exclusão de conta
- Menu do usuário → **Configurações** → **Excluir conta**
- A exclusão tem janela de 15 dias para reconsideração antes da remoção definitiva (ver `docs/lgpd-deletion-policy.md`)

---

## Smoke test ponta-a-ponta

Para validar uma instalação nova, o operador deve conseguir executar este fluxo de cabo a rabo sem assistência:

1. Receber convite de ADMIN → completar magic link → onboarding (Welcome+Done) → aceitar termos LGPD
2. Configurar primeira credencial (Google Places) → status `OK`
3. Disparar primeira coleta (nicho + cidade + volume = 10) → job `DONE` em ≤ 5 min
4. Abrir lista de leads → ver pelo menos 1 lead coletado
5. Abrir detalhe de um lead → conferir Score Breakdown e Provenance
6. Gerar pitch LLM → conferir texto retornado
7. Exportar CSV de todos os leads → arquivo baixado
8. Acionar `GET /api/v1/profile/data-export` → JSON portable retornado

Esse smoke test também roda automatizado via:

```bash
npm run smoke
```

(executa `tests/e2e/smoke.spec.ts` no Playwright contra o ambiente local)

---

## Resolução de problemas comuns

| Sintoma | Onde olhar |
|---------|-----------|
| Magic link não chega | Pasta de spam; `docs/runbooks/incident-response.md` |
| Coleta trava em `PENDING` | `docs/runbooks/scraper-collection.md` (verificar trigger.dev e credencial) |
| Pitch retorna erro | Verificar saldo Anthropic/OpenAI; `output/workspace/lead-hunting-engine/PENDING-ACTIONS.md` |
| Export demora demais | Acima de 10k linhas vai para fila assíncrona — esperar e abrir `/exports` |
| Healthcheck falha | `/api/health` ou `/api/health?service=supabase` — escalar via `incident-response.md` |
| Lead duplicado | Pipeline de deduplicação roda automaticamente; revisar `module-12-intelligence-core` |

---

## Onde achar suporte

- ADMIN do workspace (canal interno definido pela empresa)
- Catálogo de erros: [docs/error-catalog.md](docs/error-catalog.md)
- Pendências operacionais conhecidas: [PENDING-ACTIONS.md](PENDING-ACTIONS.md)
- Runbooks técnicos: [docs/runbooks/](docs/runbooks/)
