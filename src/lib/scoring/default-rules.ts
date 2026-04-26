/**
 * Fonte canônica das regras de scoring padrão.
 *
 * Mantém o mapping documentado em `docs/scoring-weight-mapping.md`
 * (INTAKE pesos 1-3 → percentuais DB). Importado por:
 *  - `prisma/seed/scoring-rules.ts`
 *  - `src/services/config.service.ts::resetScoringRules`
 *  - `src/actions/config.ts::DEFAULT_SCORING_RULES`
 *
 * Invariantes:
 *  - Σ weights = 100
 *  - Para pesos INTAKE 3 > 2 > 1, o peso DB correspondente preserva a ordenação
 */

export type IntakeWeight = 1 | 2 | 3

export interface DefaultScoringRule {
  slug: string
  name: string
  description: string
  /** Percentual DB (0-100). Soma dos ativos = 100. */
  weight: number
  /** Peso INTAKE original (1-3). Usado para validação de invariantes. */
  intakeWeight: IntakeWeight
  /** CLs que originam este sinal (ver intake-review compare). */
  clSources: string[]
  isActive: true
  condition: Record<string, unknown>
}

export const DEFAULT_SCORING_RULES: DefaultScoringRule[] = [
  {
    slug: 'website_presence',
    name: 'Presença Web',
    description: 'Empresa possui site ativo, com HTTPS, responsivo e mínimos padrões de qualidade visual (agrega "sem site" e "site ruim").',
    weight: 20,
    intakeWeight: 3,
    clSources: ['CL-069', 'CL-070'],
    isActive: true,
    condition: {},
  },
  {
    slug: 'social_presence',
    name: 'Presença Social',
    description: 'Empresa ativa em Instagram, Facebook, LinkedIn ou Google Meu Negócio.',
    weight: 13,
    intakeWeight: 2,
    clSources: ['CL-072'],
    isActive: true,
    condition: {},
  },
  {
    slug: 'reviews_rating',
    name: 'Avaliações',
    description: 'Quantidade e qualidade de avaliações online (Google, plataformas verticais).',
    weight: 13,
    intakeWeight: 2,
    clSources: ['CL-071'],
    isActive: true,
    condition: {},
  },
  {
    slug: 'location_access',
    name: 'Localização',
    description: 'Relevância geográfica e presença local. Absorve arredondamento inteiro da matriz (ver docs/scoring-weight-mapping.md).',
    weight: 14,
    intakeWeight: 2,
    clSources: [],
    isActive: true,
    condition: {},
  },
  {
    slug: 'business_maturity',
    name: 'Maturidade Digital',
    description: 'Indicadores de automação, ferramentas digitais, processos estruturados.',
    weight: 20,
    intakeWeight: 3,
    clSources: ['CL-074'],
    isActive: true,
    condition: {},
  },
  {
    slug: 'digital_gap',
    name: 'Gap Digital',
    description: 'Oportunidade de melhoria identificada (atendimento manual, WhatsApp reativo, ausência de automação).',
    weight: 20,
    intakeWeight: 3,
    clSources: ['CL-073'],
    isActive: true,
    condition: {},
  },
]

// ─── Invariantes verificadas em build-time (module load) ──────────────────────

const TOTAL_WEIGHT = DEFAULT_SCORING_RULES.reduce((sum, r) => sum + r.weight, 0)
if (TOTAL_WEIGHT !== 100) {
  throw new Error(
    `[scoring default-rules] Invariante violada: soma dos pesos deve ser 100, encontrada ${TOTAL_WEIGHT}`,
  )
}

/**
 * Slugs que existiram em seeds anteriores mas foram renomeados para alinhar com
 * `DIMENSION_MAP` em `src/lib/intelligence/scoring/scoring-engine.ts`.
 * Removidos pelo seed/reset para evitar pesos órfãos em bancos de dev legados.
 * Ver docs/scoring-weight-mapping.md.
 */
export const DEPRECATED_SCORING_SLUGS = ['reviews', 'location', 'digital_maturity'] as const

for (const high of DEFAULT_SCORING_RULES.filter(r => r.intakeWeight === 3)) {
  for (const low of DEFAULT_SCORING_RULES.filter(r => r.intakeWeight === 2)) {
    if (high.weight < low.weight) {
      throw new Error(
        `[scoring default-rules] Invariante violada: slug "${high.slug}" (peso INTAKE 3) tem peso DB ${high.weight}% menor que "${low.slug}" (peso INTAKE 2) com ${low.weight}%.`,
      )
    }
  }
}
