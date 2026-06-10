import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { computeProviderHealthForOperator } from '@/lib/providers/health-status'

/**
 * GET /api/v1/health/providers
 *
 * Saude dos providers para qualquer usuario AUTENTICADO (operador ou admin).
 * Mesmo calculo do endpoint admin (src/lib/providers/health-status.ts), com
 * lastError mascarado — operador ve o estado (UP/DEGRADED/DOWN/PAUSED) sem o
 * detalhe cru de erro de infra.
 *
 * Consumido por G16 ProviderHealthBadge via ProviderHealthContext (polling 30s)
 * em telas de operador (nova coleta, detalhe da coleta, radar, exportacao).
 */
export async function GET() {
  try {
    await requireAuth()
    const items = await computeProviderHealthForOperator()
    return successResponse(items)
  } catch (error) {
    return handleApiError(error)
  }
}
