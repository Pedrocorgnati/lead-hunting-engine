import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { buildAdminQueueWhere, QUEUE_STATUSES, toQueueJobView } from '@/lib/workers/admin-queue'

const ListQuerySchema = z.object({
  status: z.enum(QUEUE_STATUSES).optional(),
  kind: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(40).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const query = ListQuerySchema.parse(Object.fromEntries(searchParams))
    const { page, limit, ...filters } = query
    const where = buildAdminQueueWhere(filters)

    const [total, jobs] = await Promise.all([
      prisma.localQueueJob.count({ where }),
      prisma.localQueueJob.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          kind: true,
          payload: true,
          status: true,
          attempts: true,
          leasedUntil: true,
          lastError: true,
          createdAt: true,
          runAt: true,
        },
      }),
    ])

    return paginatedResponse(jobs.map(toQueueJobView), { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
