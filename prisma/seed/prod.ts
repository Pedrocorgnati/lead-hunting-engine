/**
 * prisma/seed/prod.ts
 *
 * Seed de produção — APENAS dados obrigatórios para o sistema funcionar.
 * NÃO cria usuários (provisionados via convite pelo primeiro admin).
 * NÃO cria leads ou jobs de exemplo.
 *
 * Execução: bun run seed:prod | npx tsx prisma/seed/prod.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedScoringRules } from './scoring-rules'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Prod seed iniciando...')

  // Regras de scoring padrão — obrigatórias para o sistema calcular pontuação
  await seedScoringRules(prisma)

  console.log('✅ Prod seed concluído: scoring_rules inicializadas')
}

main()
  .catch((e) => {
    console.error('❌ Erro no prod seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
