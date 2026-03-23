import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { profileService } from '@/services/profile.service'

export async function GET() {
  try {
    const user = await requireAuth()
    const exportData = await profileService.exportData(user.id)
    return successResponse(exportData)
  } catch (error) {
    return handleApiError(error)
  }
}
