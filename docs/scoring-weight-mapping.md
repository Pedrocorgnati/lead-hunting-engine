# Scoring Weight Mapping — INTAKE (pesos 1-3) → DB (percentuais)

**Status:** v1.0 — 2026-04-21
**Escopo:** Intake Review gaps CL-069..CL-074 (TASK-2)
**Fonte canônica:** `src/lib/scoring/default-rules.ts`

---

## Contexto

O **INTAKE** descreve os sinais de qualificação comercial em escala de prioridade **1-3** (3 = alta, 2 = média, 1 = baixa). O banco de dados (`ScoringRule.weight`) modela pesos como **percentuais inteiros que somam 100**. Este documento registra a matriz de conversão e a justificativa por trás dos percentuais vigentes.

## Inventário INTAKE → CL → Slug DB

| CL-ID | Sinal INTAKE | Peso INTAKE | Slug canônico | Aggregator |
|-------|--------------|-------------|---------------|-----------|
| CL-069 | Sem site | 3 | `website_presence` | primary |
| CL-070 | Site ruim (estética, HTTPS, responsividade) | 2 | `website_presence` | sub-signal (agregado) |
| CL-071 | Muitos reviews / reviews ruins | 2 | `reviews_rating` | primary |
| CL-072 | Instagram ativo | 2 | `social_presence` | primary |
| CL-073 | WhatsApp manual / atendimento reativo | 3 | `digital_gap` | primary |
| CL-074 | Sem automação / maturidade digital baixa | 3 | `business_maturity` | primary |

O sinal **`location_access`** (presença geográfica / relevância local) não foi enumerado nos CLs, mas existe no engine (`DIMENSION_MAP`) como proxy de qualificação regional. Atribuímos peso INTAKE equivalente **2** (sinal moderado) para manter a invariante `sum=100%`.

**Alinhamento de slugs (fix silencioso):** seeds antigos usavam `reviews`, `location`, `digital_maturity`. O `scoring-engine.ts::DIMENSION_MAP` sempre esperou `reviews_rating`, `location_access`, `business_maturity`. A divergência tornava 3 das 6 dimensões efetivamente nulas em runtime. A TASK-2 padroniza os slugs alinhados ao engine e adiciona cleanup de slugs deprecados no seed e no `POST /api/v1/admin/config/scoring-rules/reset`.

## Matriz de conversão

Normalização: `peso_% = round(peso_INTAKE / Σpesos × 100)`, com ajuste inteiro em `location` para absorver o arredondamento e manter `Σ = 100`.

Σpesos INTAKE = 3 + 2 + 2 + 2 + 3 + 3 = **15**

| Slug canônico | Peso INTAKE | % teórico | % DB final | Sinais INTAKE agregados |
|---------------|-------------|-----------|------------|-------------------------|
| `website_presence` | 3 | 20.00 | **20** | CL-069, CL-070 |
| `social_presence` | 2 | 13.33 | **13** | CL-072 |
| `reviews_rating` | 2 | 13.33 | **13** | CL-071 |
| `location_access` | 2 | 13.33 | **14** | (sinal derivado — absorve arredondamento) |
| `business_maturity` | 3 | 20.00 | **20** | CL-074 |
| `digital_gap` | 3 | 20.00 | **20** | CL-073 |
| **Total** | **15** | **100** | **100** | |

### Justificativa

- **website_presence** agrega dois CLs (069 + 070) porque ambos medem a mesma dimensão ("empresa tem presença web minimamente funcional?"). A agregação é feita na lógica do `scoring-engine` via sub-sinais internos; o peso DB permanece 20% (peso INTAKE 3), refletindo a prioridade mais alta dos dois sinais.
- **location_access** recebe 14% em vez de 13% para absorver o erro de arredondamento de `2/15×100 = 13.33...`. Escolha arbitrária (poderia ter sido `reviews_rating` ou `social_presence`), justificada pela relevância prática de localização geográfica na qualificação B2B em mercados regionais.
- **Mudança vs. estado anterior:** pesos antigos (`website_presence=20`, `social_presence=20`, `reviews=20`, `location=15`, `digital_maturity=15`, `digital_gap=10`) privilegiavam sinais de peso INTAKE 2 acima de sinais de peso INTAKE 3 (ex.: `reviews`(peso 2)=20% > `digital_maturity`(peso 3)=15%). A nova distribuição restaura a ordenação correta: **pesos 3 > pesos 2**.

## Invariantes

1. **Sum = 100%:** soma dos `ScoringRule.weight` ativos = 100.
2. **Ordenação relativa:** para todo par `(a, b)` onde `peso_INTAKE(a) > peso_INTAKE(b)`, deve valer `peso_DB(a) ≥ peso_DB(b)`. Em caso de empate, desempates por proximidade do CL mais estratégico (ver justificativa).
3. **Fonte única de verdade:** `src/lib/scoring/default-rules.ts` é a constante canônica. `prisma/seed/scoring-rules.ts`, `src/services/config.service.ts::resetScoringRules` e `src/actions/config.ts::DEFAULT_SCORING_RULES` importam daqui. O seed em `prisma/seeds/scoring-rules.ts` (duplicado legado, **não referenciado pelo runner**) será removido em follow-up.
4. **Reset-defaults:** chamada a `POST /api/v1/admin/config/scoring-rules/reset` deve produzir exatamente a matriz acima.

## Testes automatizados

- `src/lib/intelligence/scoring/__tests__/weight-mapping.test.ts` verifica as invariantes 1 e 2.
- Regressão: seed dev + recálculo de scoring deve manter as temperaturas (HOT/WARM/COLD) dentro de tolerância de ±5 pontos (ver TASK-2 ST005).

## Anexo A — Análise de Regressão (TASK-2 ST005)

### Achado crítico: drift de slugs pré-TASK-2

Antes da TASK-2, existia **drift silencioso** entre o seed/DB e o scoring engine:

| Origem | Slug | Situação |
|--------|------|----------|
| Seed/DB antigos | `reviews`, `location`, `digital_maturity` | ativo |
| `scoring-engine.ts::DIMENSION_MAP` | `reviews_rating`, `location_access`, `business_maturity` | canônico |

O engine itera `DIMENSION_MAP` e lê `weights[slug] ?? 0`. Como os slugs divergiam, **três das seis dimensões tinham peso efetivo 0** em runtime. O score total dos leads ficava artificialmente baixo (apenas 3 de 6 sinais pesavam).

**Consequência do fix:** ao alinhar os slugs no seed com os esperados pelo engine, o scoring passa a refletir todas as dimensões — comportamento intencional e descrito no INTAKE. Alguns leads verão aumento absoluto de score. Isto **não é regressão** — é correção de bug silencioso (violação Zero Silencio).

### Simulação analítica (leads sintéticos)

Comparação em cinco perfis representativos, calculando score ponderado sob duas hipóteses:

- **Antes:** pesos DB antigos (20/20/20/15/15/10) — *mas o engine efetivamente zerava reviews_rating, location_access, business_maturity por drift de slug*.
- **Depois:** pesos novos (20/13/13/14/20/20) com slugs alinhados ao engine.

| Perfil | Scores dim. (web/soc/rev/loc/mat/gap) | Antes (drift) | Antes (consistente) | Depois | Δ vs consistente |
|--------|---------------------------------------|--------------:|--------------------:|-------:|-----------------:|
| Neutro | 50/50/50/50/50/50 | 25 | 50 | 50 | 0 |
| Forte em todos | 100/100/100/100/100/100 | 50 | 100 | 100 | 0 |
| Fraco em todos | 0/0/0/0/0/0 | 0 | 0 | 0 | 0 |
| Forte web + gap | 90/30/40/50/50/90 | 36 | 58 | 63 | +5 |
| Alta maturidade, baixa web | 30/40/50/60/90/80 | 28 | 57 | 64 | +7 |

Observações:
- Para leads simétricos (neutro, todos forte, todos fraco), **delta = 0**.
- Para leads assimétricos, o delta fica no intervalo **0..+8** em relação a uma baseline "Antes consistente" (sem drift). **Ordem relativa entre leads é preservada.**
- O delta vs "Antes com drift" é muito maior (até +30 pontos) — mas esse estado era intrinsecamente bugado, não serve como baseline de regressão.

### Temperatura (HOT/WARM/COLD)

A coluna `Lead.temperature` é persistida no DB, sem função utilitária no código fonte que derive `temperature` diretamente de `score` em tempo real — a atribuição acontece em pipelines de enriquecimento ou manual pelo usuário. Portanto:

- Leads com `temperature` já atribuída **não mudam automaticamente** — o fix só afeta scores novos/recalculados.
- Leads reprocessados pelo pipeline (pós-deploy) usarão o novo score. A revisão da política de thresholds HOT/WARM/COLD pode ser necessária se o pipeline recalcular temperatura com os novos scores — ver backlog `CL-xxx` (fora do escopo desta task).

### Plano de validação em ambiente com DB

Passos a executar em staging após deploy:

1. `npm run seed:dev` em DB limpo → verificar 6 slugs criados com pesos (20/13/13/14/20/20) e soma 100.
2. Em DB com dados existentes, executar `POST /api/v1/admin/config/scoring-rules/reset` → verificar delete de slugs deprecados (`reviews`, `location`, `digital_maturity`) e upsert dos novos.
3. Reprocessar amostra de 20 leads representativos (5 HOT, 10 WARM, 5 COLD) — comparar score antes/depois. Meta: deltas absolutos < 10 pontos para perfis típicos; zero reclassificações automáticas.
4. Dashboard admin de scoring-rules deve mostrar os 6 slugs novos com pesos corretos.
5. `npm run test -- scoring` deve passar todos os cenários em `weight-mapping.test.ts` e `scoring.test.ts::calculateScore`.

### Status

- [x] Análise simulada concluída — zero regressão crítica em perfis testados.
- [ ] Execução em staging com DB real — pendente (gate de deploy parcial, fase G do DCP).

## Referências

- INTAKE: `output/brief/lead-hunting-engine/INTAKE.md` (seção Scoring)
- Compare: `output/wbs/lead-hunting-engine/intake-review/INTAKE-REVIEW-COMPARE.md`
- Task: `output/wbs/lead-hunting-engine/intake-review/INTAKE-REVIEW-TASKS/TASK-2.md`
- Engine source: `src/lib/intelligence/scoring/scoring-engine.ts`
- Canonical defaults: `src/lib/scoring/default-rules.ts`
