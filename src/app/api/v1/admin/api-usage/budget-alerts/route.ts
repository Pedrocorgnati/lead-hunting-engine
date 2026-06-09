import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getApiUsageBreakdown,
  getApiUsageProjection,
  getCalendarPeriodBounds,
  type ApiUsagePeriod,
} from '@/lib/observability/api-usage-logger'

/**
 * POST /api/v1/admin/api-usage/budget-alerts
 * Avaliacao on-demand de budget (stateless por design: o budget e fornecido
 * pelo cliente; nao ha tabela de persistencia neste momento). Compara o uso
 * de creditos do periodo calendario atual contra o teto informado e retorna
 * o status do alerta. warnThreshold em 0..1 (default 0.8).
 *
 * Decisao de produto (deferida ao default): alerta = avaliacao, nao
 * assinatura persistida. Persistencia + notificacao automatica ficam para um
 * modelo dedicado (requer migracao Prisma) quando houver demanda.
 */
const BodySchema = z.object({
  budgetCredits: z.number().positive('budgetCredits deve ser positivo'),
  period: z.enum(['day', 'week', 'month']).default('month'),
  warnThreshold: z.number().min(0).max(1).default(0.8),
})

type AlertStatus = 'ok' | 'approaching' | 'exceeded'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const json = await request.json().catch(() => ({}))
    const { budgetCredits, period, warnThreshold } = BodySchema.parse(json)
    const typedPeriod = period as ApiUsagePeriod

    const { start } = getCalendarPeriodBounds(typedPeriod)
    const breakdown = await getApiUsageBreakdown({ since: start })
    const usedCredits = breakdown.reduce((acc, r) => acc + r.creditTotal, 0)
    const usageRatio = budgetCredits > 0 ? usedCredits / budgetCredits : 0

    const projection = await getApiUsageProjection({ period: typedPeriod })
    const projectedCredits = projection.projected.credits
    const projectedRatio = budgetCredits > 0 ? projectedCredits / budgetCredits : 0

    let status: AlertStatus = 'ok'
    if (usageRatio >= 1) status = 'exceeded'
    else if (usageRatio >= warnThreshold || projectedRatio >= 1) status = 'approaching'

    return successResponse({
      period: typedPeriod,
      budgetCredits,
      usedCredits,
      usageRatio: Number(usageRatio.toFixed(4)),
      projectedCredits,
      projectedRatio: Number(projectedRatio.toFixed(4)),
      warnThreshold,
      status,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
