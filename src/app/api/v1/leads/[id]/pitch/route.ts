import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { UpdateLeadPitchSchema } from '@/schemas/lead.schema'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const validated = UpdateLeadPitchSchema.parse(body)

    const lead = await leadService.updatePitch(id, user.id, validated)
    return successResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}
