import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/v1/admin/audit-log
 *
 * Query params:
 *   - resource (string), action (string, substring)
 *   - userId (uuid)
 *   - correlationId (match em metadata.correlationId)
 *   - from (ISO), to (ISO) — janela de createdAt
 *   - page (1), limit (<=100, default 50)
 *
 * RBAC: apenas ADMIN.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { where, page, limit } = buildAuditLogQuery(request.url)

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          userId: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return paginatedResponse(logs, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}

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
