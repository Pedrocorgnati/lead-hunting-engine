import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { buildAuditLogQuery } from './_query'

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

