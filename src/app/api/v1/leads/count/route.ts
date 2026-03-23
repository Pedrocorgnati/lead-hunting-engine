import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'

export async function GET() {
  try {
    const user = await requireAuth()
    const counts = await leadService.count(user.id)
    return successResponse(counts)
  } catch (error) {
    return handleApiError(error)
  }
}
