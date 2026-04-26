import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'

/**
 * GET /api/v1/notifications?status=read|unread|all&page=1&limit=20
 *   -> paginatedResponse com lista ordenada por createdAt desc
 *
 * Origem: INTAKE-REVIEW TASK-9 / CL-136.
 */

const ListQuerySchema = z.object({
  status: z.enum(['read', 'unread', 'all']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(0).max(100).optional().default(20),
})

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const query = ListQuerySchema.parse(Object.fromEntries(searchParams))

    const where: { userId: string; read?: boolean } = { userId: user.id }
    if (query.status === 'read') where.read = true
    if (query.status === 'unread') where.read = false

    const [total, data] = await Promise.all([
      prisma.notification.count({ where }),
      query.limit === 0
        ? Promise.resolve([])
        : prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
    ])

    return paginatedResponse(data, {
      page: query.page,
      limit: query.limit,
      total,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
