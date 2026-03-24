/**
 * Setup compartilhado executado antes/após cada arquivo de teste de integração.
 *
 * Estratégia de isolamento: TRUNCATE das tabelas de dados variáveis após cada suite.
 * Dados base (scoring rules, seed de teste) são restaurados via reseed se necessário.
 *
 * ATENÇÃO: Configure DATABASE_URL apontando para banco de TESTE antes de executar.
 */
import { prisma } from '@/lib/prisma'

afterAll(async () => {
  await prisma.$disconnect()
})
