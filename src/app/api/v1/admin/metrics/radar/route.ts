import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { radarUsagePerUser, type MetricsRange } from '@/lib/metrics/aggregator'

const VALID_RANGES: MetricsRange[] = ['7d', '30d', '90d', 'all']

/**
 * GET /api/v1/admin/metrics/radar?range=30d
 * Ranking de operadores por uso do Radar (re-coletas + leads novos).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const url = new URL(request.url)
    const rangeParam = (url.searchParams.get('range') ?? '30d') as MetricsRange
    const range = VALID_RANGES.includes(rangeParam) ? rangeParam : '30d'

    const rows = await radarUsagePerUser(range)

    return successResponse({ range, rows })
  } catch (error) {
    return handleApiError(error)
  }
}
