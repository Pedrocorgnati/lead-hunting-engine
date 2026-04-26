import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/metrics/dedup
 *
 * Agrega metricas de dedup em duas janelas (7d e 30d):
 *   - pending, merged, kept_both, rejected, undone
 *   - undo_rate = undone / merged (proxy para falso positivo)
 *
 * Origem: TASK-9 intake-review / CL-226.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireAdmin()
    const now = Date.now()
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000)

    async function windowStats(since: Date | null) {
      const where = since ? { createdAt: { gte: since } } : undefined
      const rows = await prisma.duplicateCandidate.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      })
      const out: Record<string, number> = {
        PENDING: 0,
        MERGED: 0,
        KEEP_BOTH: 0,
        REJECTED: 0,
        UNDONE: 0,
      }
      for (const row of rows) out[row.status] = row._count._all
      const undoRate = out.MERGED > 0 ? out.UNDONE / out.MERGED : 0
      return { ...out, undoRate }
    }

    const [all, last7, last30] = await Promise.all([
      windowStats(null),
      windowStats(d7),
      windowStats(d30),
    ])

    return successResponse({
      all,
      last7,
      last30,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
