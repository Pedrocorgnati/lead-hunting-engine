import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

// Lazy singleton — only creates the client when first accessed at runtime
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

/**
 * RLS Safety Pattern (SEC-007, SEC-011):
 * Every API handler accessing leads/jobs/raw_lead_data MUST include:
 *   where: { userId: session.user.id, ...otherFilters }
 * Never query by ID alone without the authenticated user's userId.
 *
 * CORRECT:  prisma.lead.findUnique({ where: { id: leadId, userId: session.user.id } })
 * WRONG:    prisma.lead.findUnique({ where: { id: leadId } })
 */
// Proxy that defers access to runtime (avoids build-time DATABASE_URL requirement)
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getPrisma(), prop)
  },
})
