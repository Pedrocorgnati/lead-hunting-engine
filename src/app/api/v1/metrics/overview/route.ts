import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { overview, type MetricsRange } from '@/lib/metrics/aggregator'

const VALID_RANGES: MetricsRange[] = ['7d', '30d', '90d', 'all']

/**
 * GET /api/v1/metrics/overview?range=7d|30d|90d|all
 * Retorna totals, conversionRate, avgScore, avgTimeToQualify, leadsPerDay.
 * RLS: apenas leads do usuário autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const rangeParam = req.nextUrl.searchParams.get('range') ?? '30d'
    const range = (VALID_RANGES as string[]).includes(rangeParam)
      ? (rangeParam as MetricsRange)
      : '30d'

    const data = await overview(user.id, range)
    return successResponse(data)
  } catch (error) {
    return handleApiError(error)
  }
}
