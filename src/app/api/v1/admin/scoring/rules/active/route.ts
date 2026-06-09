import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

/**
 * GET /api/v1/admin/scoring/rules/active
 * Retorna todas as regras de scoring ativas ordenadas por sortOrder.
 * Alias canonico para /api/v1/admin/config/scoring-rules.
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const rules = await configService.getScoringRules()
    return successResponse({ rules })
  } catch (error) {
    return handleApiError(error)
  }
}
