import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const history = await configService.listScoringRuleHistory(id)
    return successResponse({ ruleId: id, history })
  } catch (error) {
    return handleApiError(error)
  }
}
