import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getProductMetrics } from '@/lib/metrics/product-metrics'

/**
 * GET /api/v1/admin/metrics/product
 *
 * Retorna as 4 metricas de SLA de produto (CL-174..CL-177) com valor atual,
 * meta do INTAKE e status (OK / ALERTA / SEM_DADOS) para renderizacao em cards.
 *
 * RBAC: apenas ADMIN; filtro por userId do admin autenticado.
 * Janela default: 30 dias.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const windowDaysParam = request.nextUrl.searchParams.get('windowDays')
    const windowDays = windowDaysParam ? Math.max(1, Math.min(365, Number(windowDaysParam) || 30)) : 30
    const metrics = await getProductMetrics(user.id, { windowDays })
    return successResponse(metrics)
  } catch (error) {
    return handleApiError(error)
  }
}
