import type { Prisma } from '@prisma/client'

/**
 * Query builder compartilhado da listagem/export de audit log (extraido de
 * route.ts: o type-check de rotas do Next proibe exports nao-handler em
 * arquivos route.ts — falha de build com webpack).
 */
export function buildAuditLogQuery(requestUrl: string): {
  where: Prisma.AuditLogWhereInput
  page: number
  limit: number
} {
  const { searchParams } = new URL(requestUrl)
  const resource = searchParams.get('resource') ?? undefined
  const action = searchParams.get('action') ?? undefined
  const userId = searchParams.get('userId') ?? undefined
  const correlationId = searchParams.get('correlationId')?.trim() || undefined
  const fromStr = searchParams.get('from') ?? undefined
  const toStr = searchParams.get('to') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10))
  )

  const where: Prisma.AuditLogWhereInput = {}
  if (resource) where.resource = resource
  if (action) where.action = { contains: action, mode: 'insensitive' }
  if (userId) where.userId = userId

  const createdAt: Prisma.DateTimeFilter = {}
  if (fromStr) {
    const from = new Date(fromStr)
    if (!Number.isNaN(from.getTime())) createdAt.gte = from
  }
  if (toStr) {
    const to = new Date(toStr)
    if (!Number.isNaN(to.getTime())) createdAt.lte = to
  }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

  if (correlationId) {
    where.metadata = {
      path: ['correlationId'],
      equals: correlationId,
    }
  }

  return { where, page, limit }
}

