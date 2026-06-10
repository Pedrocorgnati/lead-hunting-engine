import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { listAlerts } from '@/lib/alerts/lifecycle'

/**
 * GET /api/v1/admin/alerts
 *
 * Lista os alertas operacionais disparados (sent_alerts) com lifecycle
 * efetivo (ACTIVE/SILENCED/RESOLVED; snooze expirado volta a ACTIVE).
 * RBAC: ADMIN. Consumido por AD30 /admin/alertas.
 */
export async function GET() {
  try {
    await requireAdmin()
    const alerts = await listAlerts()
    // Item 066: correlationId de requisicao para rastreio das acoes da tela
    return successResponse({ alerts, correlationId: crypto.randomUUID() })
  } catch (error) {
    return handleApiError(error)
  }
}
