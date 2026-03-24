/**
 * Seed: Scoring Rules — 6 dimensões padrão
 * Executar: npx tsx prisma/seeds/scoring-rules.ts
 * Idempotente: usa upsert por slug.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_RULES = [
  { slug: 'website_presence', name: 'Presença Web', description: 'Possui site? HTTPS? Mobile-friendly?', weight: 20 },
  { slug: 'social_presence', name: 'Presença Social', description: 'Instagram, Facebook, LinkedIn, Google Meu Negócio', weight: 20 },
  { slug: 'reviews', name: 'Avaliações', description: 'Quantidade e qualidade de avaliações online', weight: 20 },
  { slug: 'location', name: 'Localização', description: 'Relevância geográfica e presença local', weight: 15 },
  { slug: 'digital_maturity', name: 'Maturidade Digital', description: 'Nível geral de presença e maturidade digital', weight: 15 },
  { slug: 'digital_gap', name: 'Gap Digital', description: 'Oportunidade de melhoria identificada', weight: 10 },
] as const

async function main() {
  console.log('Seeding scoring rules...')

  for (const rule of DEFAULT_RULES) {
    await prisma.scoringRule.upsert({
      where: { slug: rule.slug },
      update: { name: rule.name, description: rule.description, weight: rule.weight },
      create: { slug: rule.slug, name: rule.name, description: rule.description, weight: rule.weight },
    })
    console.log(`  ✓ ${rule.slug} (${rule.weight}%)`)
  }

  console.log(`Done — ${DEFAULT_RULES.length} rules seeded.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
