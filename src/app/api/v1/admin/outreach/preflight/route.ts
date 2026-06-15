/**
 * outreach-engine (brainstorm 06-10, task 31): checklist de pré-produção.
 * GET retorna o último resultado persistido; POST executa o checklist
 * completo. Falha de item bloqueante mantém passed=false (bloqueia ativação).
 */
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { runProductionPreflight, isProductionPreflightPassed } from '@/lib/outreach/production-preflight'
import { AuditService } from '@/lib/services/audit-service'

export async function GET() {
  try {
    await requireAdmin()
    const status = await isProductionPreflightPassed()
    return successResponse(status)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST() {
  try {
    const admin = await requireAdmin()
    const result = await runProductionPreflight(admin.id)
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.killswitch_toggled',
      resource: 'outreach',
      metadata: { preflight: true, passed: result.passed },
    })
    return successResponse(result)
  } catch (error) {
    return handleApiError(error)
  }
}
