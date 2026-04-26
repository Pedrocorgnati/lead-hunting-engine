import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getApiUsageBreakdown } from '@/lib/observability/api-usage-logger'

/**
 * GET /api/v1/admin/metrics/api-usage?period=month|week|day
 * Retorna breakdown de chamadas por provider x callType no periodo.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const url = new URL(request.url)
    const period = (url.searchParams.get('period') ?? 'month') as 'day' | 'week' | 'month'

    const since = new Date()
    if (period === 'day') since.setDate(since.getDate() - 1)
    else if (period === 'week') since.setDate(since.getDate() - 7)
    else since.setMonth(since.getMonth() - 1)

    const breakdown = await getApiUsageBreakdown({ since })

    return successResponse({ period, since: since.toISOString(), breakdown })
  } catch (error) {
    return handleApiError(error)
  }
}
