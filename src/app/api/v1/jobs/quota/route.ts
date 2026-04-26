import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { quotaEnforcer } from '@/lib/services/quota-enforcer'

/**
 * GET /api/v1/jobs/quota
 *
 * Snapshot de quota do operador: monthly {used,max,allowed,resetAt} e
 * concurrency {running,max,allowed}. Consumido pelo QuotaBadge em /coletas
 * (INTAKE-REVIEW TASK-3 / CL-228).
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const snapshot = await quotaEnforcer.getSnapshot(user.id)
    return successResponse(snapshot)
  } catch (error) {
    return handleApiError(error)
  }
}
