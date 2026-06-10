/**
 * prisma/seed/client.ts
 *
 * Client Prisma para scripts de seed (tsx, fora do Next).
 * Prisma 7 + driver adapters: `new PrismaClient()` sem adapter lança
 * PrismaClientInitializationError — todo seed DEVE construir via este helper.
 * Espelha src/lib/prisma.ts (sem 'server-only', que nao existe sob tsx).
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

export function createSeedClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL é obrigatória para rodar seeds (preencha o .env)')
  }
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}
