import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

export async function POST() {
  try {
    await requireAdmin()
    const rules = await configService.resetScoringRules()
    return successResponse(rules)
  } catch (error) {
    return handleApiError(error)
  }
}
