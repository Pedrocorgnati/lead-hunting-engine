import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'
import { UpdateScoringRuleSchema } from '@/schemas/config.schema'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin()
    const { id } = await params
    const body = await request.json()
    const validated = UpdateScoringRuleSchema.parse(body)
    const changeReason =
      typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).__reason === 'string'
        ? ((body as Record<string, unknown>).__reason as string)
        : undefined

    const rule = await configService.updateScoringRule(id, validated, {
      changedBy: user.id,
      changeReason,
    })
    return successResponse(rule)
  } catch (error) {
    return handleApiError(error)
  }
}
