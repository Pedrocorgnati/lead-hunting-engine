import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { buildAdminQueueWhere, QUEUE_STATUSES } from '@/lib/workers/admin-queue'

const StatsQuerySchema = z.object({
  kind: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(40).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const filters = StatsQuerySchema.parse(Object.fromEntries(searchParams))
    const where = buildAdminQueueWhere(filters)

    const [total, byStatusRows, nextPending, oldestPending, latestCreated] = await Promise.all([
      prisma.localQueueJob.count({ where }),
      prisma.localQueueJob.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      prisma.localQueueJob.findFirst({
        where: buildAdminQueueWhere({ ...filters, status: 'PENDING' }),
        orderBy: { runAt: 'asc' },
        select: { runAt: true },
      }),
      prisma.localQueueJob.findFirst({
        where: buildAdminQueueWhere({ ...filters, status: 'PENDING' }),
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.localQueueJob.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    const byStatus = Object.fromEntries(QUEUE_STATUSES.map((status) => [status, 0]))
    for (const row of byStatusRows) {
      if (row.status in byStatus) byStatus[row.status] = row._count._all
    }

    return successResponse({
      filters,
      total,
      byStatus,
      pending: byStatus.PENDING,
      leased: byStatus.LEASED,
      done: byStatus.DONE,
      failed: byStatus.FAILED,
      nextRunAt: nextPending?.runAt.toISOString() ?? null,
      oldestPendingAt: oldestPending?.createdAt.toISOString() ?? null,
      lastUpdatedAt: latestCreated?.createdAt.toISOString() ?? null,
      dlqEndpoint: '/api/v1/admin/dlq',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
