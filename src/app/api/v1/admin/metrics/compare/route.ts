import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/metrics/compare
 *
 * Compara metricas entre dois periodos (current vs previous). Usado pelo
 * admin metrics v2 para mostrar variacao percentual (WoW/MoM).
 *
 * Query:
 *   - period: '7d' | '30d' (default 7d)
 *
 * Retorna:
 *   { current: {...}, previous: {...}, delta: {...} }
 *
 * Origem: TASK-13 intake-review / ST001.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') === '30d' ? 30 : 7
    const now = Date.now()
    const currentFrom = new Date(now - period * 24 * 60 * 60 * 1000)
    const previousFrom = new Date(now - 2 * period * 24 * 60 * 60 * 1000)

    async function bucket(from: Date, to: Date) {
      const [jobs, leads, llmCost] = await Promise.all([
        prisma.collectionJob.count({
          where: { createdAt: { gte: from, lt: to } },
        }),
        prisma.lead.count({ where: { createdAt: { gte: from, lt: to } } }),
        prisma.apiUsageLog.aggregate({
          where: { kind: 'LLM', timestamp: { gte: from, lt: to } },
          _sum: { costUsd: true },
        }),
      ])
      return {
        jobs,
        leads,
        llmCostUsd: llmCost._sum.costUsd?.toString() ?? '0',
      }
    }

    const current = await bucket(currentFrom, new Date(now))
    const previous = await bucket(previousFrom, currentFrom)

    function pct(a: number, b: number): number {
      if (b === 0) return a === 0 ? 0 : 100
      return Math.round(((a - b) / b) * 1000) / 10
    }

    return successResponse({
      period: `${period}d`,
      current,
      previous,
      delta: {
        jobs: pct(current.jobs, previous.jobs),
        leads: pct(current.leads, previous.leads),
        llmCostUsd: pct(
          Number(current.llmCostUsd),
          Number(previous.llmCostUsd)
        ),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
