import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getApiUsageProjection, type ApiUsagePeriod } from '@/lib/observability/api-usage-logger'

const VALID_PERIODS: ApiUsagePeriod[] = ['day', 'week', 'month']

/**
 * GET /api/v1/admin/api-usage/projection?period=day|week|month
 * Projecao de uso (run-rate linear) ate o fim do periodo calendario atual.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const raw = new URL(request.url).searchParams.get('period') ?? 'month'
    const period: ApiUsagePeriod = (VALID_PERIODS as string[]).includes(raw)
      ? (raw as ApiUsagePeriod)
      : 'month'

    const projection = await getApiUsageProjection({ period })
    return successResponse(projection)
  } catch (error) {
    return handleApiError(error)
  }
}
