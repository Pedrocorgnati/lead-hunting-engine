/**
 * prisma/seed/scoring-rules.ts
 *
 * Seed idempotente das 6 regras de scoring padrão.
 * Pode ser executado standalone: npx tsx prisma/seed/scoring-rules.ts
 * Ou chamado pelo seed principal (dev.ts / prod.ts).
 *
 * Invariante: soma dos pesos padrão = 100%
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Regras padrão ────────────────────────────────────────────────────────────

const DEFAULT_SCORING_RULES = [
  {
    slug: 'website_presence',
    name: 'Presença Web',
    description: 'Possui site? HTTPS? Mobile-friendly?',
    weight: 20,
    isActive: true,
    condition: {},
    sortOrder: 0,
  },
  {
    slug: 'social_presence',
    name: 'Presença Social',
    description: 'Instagram, Facebook, LinkedIn, Google Meu Negócio',
    weight: 20,
    isActive: true,
    condition: {},
    sortOrder: 1,
  },
  {
    slug: 'reviews',
    name: 'Avaliações',
    description: 'Quantidade e qualidade de avaliações online',
    weight: 20,
    isActive: true,
    condition: {},
    sortOrder: 2,
  },
  {
    slug: 'location',
    name: 'Localização',
    description: 'Relevância geográfica e presença local',
    weight: 15,
    isActive: true,
    condition: {},
    sortOrder: 3,
  },
  {
    slug: 'digital_maturity',
    name: 'Maturidade Digital',
    description: 'Nível geral de presença e maturidade digital',
    weight: 15,
    isActive: true,
    condition: {},
    sortOrder: 4,
  },
  {
    slug: 'digital_gap',
    name: 'Gap Digital',
    description: 'Oportunidade de melhoria identificada',
    weight: 10,
    isActive: true,
    condition: {},
    sortOrder: 5,
  },
] as const

// Invariante verificado em build-time
const TOTAL_WEIGHT = DEFAULT_SCORING_RULES.reduce((sum, r) => sum + r.weight, 0)
if (TOTAL_WEIGHT !== 100) {
  throw new Error(`[seed] Invariante violada: soma dos pesos deve ser 100, mas é ${TOTAL_WEIGHT}`)
}

// ─── Função exportável ────────────────────────────────────────────────────────

export async function seedScoringRules(db: PrismaClient = prisma): Promise<void> {
  for (const [index, rule] of DEFAULT_SCORING_RULES.entries()) {
    await db.scoringRule.upsert({
      where: { slug: rule.slug },
      create: { ...rule, sortOrder: index },
      update: {
        // Preserva pesos customizados — só atualiza metadados descritivos
        name: rule.name,
        description: rule.description,
        sortOrder: index,
      },
    })
  }

  console.log(
    `✓ ${DEFAULT_SCORING_RULES.length} scoring rules seeded (soma: ${TOTAL_WEIGHT}%)`
  )
}

// ─── Execução standalone ──────────────────────────────────────────────────────

async function main() {
  await seedScoringRules()
}

main()
  .catch(err => {
    console.error('[scoring-rules seed] Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
