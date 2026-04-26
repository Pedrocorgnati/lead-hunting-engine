import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export async function GET() {
  try {
    await requireAdmin()

    const now = new Date()
    const in7 = addDays(now, 7)
    const in30 = addDays(now, 30)

    const [lastRunRaw, in7days, in30days] = await Promise.all([
      prisma.auditLog.findFirst({
        where: { action: 'RETENTION_CLEANUP' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      }),
      prisma.lead.count({
        where: { retentionUntil: { gte: now, lt: in7 } },
      }),
      prisma.lead.count({
        where: { retentionUntil: { gte: now, lt: in30 } },
      }),
    ])

    const metadata =
      lastRunRaw?.metadata && typeof lastRunRaw.metadata === 'object'
        ? (lastRunRaw.metadata as Record<string, unknown>)
        : null

    const lastRun = lastRunRaw
      ? {
          executedAt: lastRunRaw.createdAt,
          deleted: (metadata?.deleted as number) ?? 0,
          rawDeleted: (metadata?.rawDeleted as number) ?? 0,
          durationMs: (metadata?.durationMs as number) ?? null,
        }
      : null

    return successResponse({
      lastRun,
      nextExpiring: { in7days, in30days },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
