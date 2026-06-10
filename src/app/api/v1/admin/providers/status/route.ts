import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { computeProviderHealth } from '@/lib/providers/health-status'

/**
 * GET /api/v1/admin/providers/status
 *
 * Health operacional real de cada provider do PROVIDER_CATALOG, derivado do
 * estado de credencial (ApiCredential) e do historico recente de chamadas
 * (ApiUsageLog). Inclui quota, rate-limit, latencia, ultimo erro e provider de
 * fallback. RBAC: ADMIN.
 *
 * Calculo compartilhado em src/lib/providers/health-status.ts (mesma fonte do
 * endpoint de operador GET /api/v1/health/providers).
 *
 * Consumido por AD19 /admin/provedores (payload completo, com lastError cru).
 */
export async function GET() {
  try {
    await requireAdmin()
    const items = await computeProviderHealth()
    return successResponse(items)
  } catch (error) {
    return handleApiError(error)
  }
}
