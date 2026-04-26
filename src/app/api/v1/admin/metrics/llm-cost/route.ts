import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/metrics/llm-cost
 *
 * Query params:
 *   - from (ISO), to (ISO) — janela (default: 30 dias)
 *   - bucket (day|week) — granularidade temporal (default: day)
 *
 * Retorna:
 *   {
 *     totals: { totalUsd, totalCalls, inputTokens, outputTokens },
 *     byProviderModel: [{ provider, model, totalUsd, calls }],
 *     series: [{ bucket, totalUsd, calls }]
 *   }
 *
 * Origem: TASK-10 intake-review (CL-216, CL-243).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
      ? new Date(searchParams.get('from')!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date()
    const bucket = searchParams.get('bucket') === 'week' ? 'week' : 'day'

    const rangeWhere = {
      kind: 'LLM' as const,
      timestamp: { gte: from, lte: to },
    }

    const [aggregate, byProviderModel, series] = await Promise.all([
      prisma.apiUsageLog.aggregate({
        where: rangeWhere,
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.apiUsageLog.groupBy({
        by: ['provider', 'model'],
        where: rangeWhere,
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      prisma.$queryRawUnsafe<Array<{ bucket: Date; total_usd: string | null; calls: bigint }>>(
        `
        SELECT date_trunc($1, timestamp) AS bucket,
               SUM(cost_usd) AS total_usd,
               COUNT(*)::bigint AS calls
        FROM api_usage_logs
        WHERE kind = 'LLM' AND timestamp >= $2 AND timestamp <= $3
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
        bucket,
        from,
        to
      ),
    ])

    return successResponse({
      totals: {
        totalUsd: aggregate._sum.costUsd?.toString() ?? '0',
        totalCalls: aggregate._count._all,
        inputTokens: aggregate._sum.inputTokens ?? 0,
        outputTokens: aggregate._sum.outputTokens ?? 0,
      },
      byProviderModel: byProviderModel.map((row) => ({
        provider: row.provider,
        model: row.model,
        totalUsd: row._sum.costUsd?.toString() ?? '0',
        calls: row._count._all,
      })),
      series: series.map((row) => ({
        bucket: row.bucket.toISOString(),
        totalUsd: row.total_usd ?? '0',
        calls: Number(row.calls),
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
