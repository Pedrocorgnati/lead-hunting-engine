import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getApiUsageBreakdown,
  getApiUsageByOperator,
  getCalendarPeriodBounds,
  type ApiUsagePeriod,
} from '@/lib/observability/api-usage-logger'

const VALID_PERIODS: ApiUsagePeriod[] = ['day', 'week', 'month']

/**
 * GET /api/v1/admin/metrics/api-usage?period=month|week|day
 * Retorna breakdown de chamadas por provider x callType e por operador no
 * periodo. O campo `operators` foi adicionado de forma retrocompativel
 * (consumidores antigos leem apenas `breakdown`).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const raw = new URL(request.url).searchParams.get('period') ?? 'month'
    const period: ApiUsagePeriod = (VALID_PERIODS as string[]).includes(raw)
      ? (raw as ApiUsagePeriod)
      : 'month'

    // Periodo calendario (consistente com projection/budget-alerts): "Uso" e
    // "Projecao.current" reconciliam para o mesmo seletor.
    const { start: since } = getCalendarPeriodBounds(period)

    const [breakdown, operators] = await Promise.all([
      getApiUsageBreakdown({ since }),
      getApiUsageByOperator({ since }),
    ])

    return successResponse({ period, since: since.toISOString(), breakdown, operators })
  } catch (error) {
    return handleApiError(error)
  }
}
