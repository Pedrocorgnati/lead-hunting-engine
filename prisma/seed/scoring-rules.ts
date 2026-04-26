/**
 * prisma/seed/scoring-rules.ts
 *
 * Seed idempotente das 6 regras de scoring padrão.
 * Pode ser executado standalone: npx tsx prisma/seed/scoring-rules.ts
 * Ou chamado pelo seed principal (dev.ts / prod.ts).
 *
 * Fonte canônica: src/lib/scoring/default-rules.ts
 * Mapping documentado: docs/scoring-weight-mapping.md
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import {
  DEFAULT_SCORING_RULES,
  DEPRECATED_SCORING_SLUGS,
} from '../../src/lib/scoring/default-rules'

const prisma = new PrismaClient()

const TOTAL_WEIGHT = DEFAULT_SCORING_RULES.reduce((sum, r) => sum + r.weight, 0)

export async function seedScoringRules(db: PrismaClient = prisma): Promise<void> {
  if (DEPRECATED_SCORING_SLUGS.length > 0) {
    await db.scoringRule.deleteMany({
      where: { slug: { in: [...DEPRECATED_SCORING_SLUGS] } },
    })
  }

  for (const [index, rule] of DEFAULT_SCORING_RULES.entries()) {
    await db.scoringRule.upsert({
      where: { slug: rule.slug },
      create: {
        slug: rule.slug,
        name: rule.name,
        description: rule.description,
        weight: rule.weight,
        isActive: rule.isActive,
        condition: rule.condition as object,
        sortOrder: index,
      },
      update: {
        // Preserva pesos customizados em DB — só atualiza metadados descritivos.
        // Para reverter aos defaults, usar `POST /api/v1/admin/config/scoring-rules/reset`.
        name: rule.name,
        description: rule.description,
        sortOrder: index,
      },
    })
  }

  console.log(
    `✓ ${DEFAULT_SCORING_RULES.length} scoring rules seeded (soma: ${TOTAL_WEIGHT}%)`,
  )
}

async function main() {
  await seedScoringRules()
}

main()
  .catch(err => {
    console.error('[scoring-rules seed] Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
