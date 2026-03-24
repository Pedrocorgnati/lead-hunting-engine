import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/audit-log
 * Retorna entradas do audit log com suporte a filtros e paginação.
 *
 * Query params:
 *   - resource (string): filtrar por recurso (ex: "invites")
 *   - action (string): filtrar por ação (substring match)
 *   - page (number, default 1)
 *   - limit (number, default 50)
 *
 * RBAC: apenas ADMIN — AUTH_004 (403) para OPERATOR.
 * COMP-001: registra userId, action, resource, resourceId, metadata, ipAddress.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const resource = searchParams.get('resource') ?? undefined
    const action = searchParams.get('action') ?? undefined
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const where: Record<string, unknown> = {}
    if (resource) where.resource = resource
    if (action) where.action = { contains: action, mode: 'insensitive' }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return paginatedResponse(logs, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
