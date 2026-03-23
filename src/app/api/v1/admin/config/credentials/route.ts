import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

export async function GET() {
  try {
    await requireAdmin()
    const credentials = await configService.getCredentials()
    return successResponse(credentials)
  } catch (error) {
    return handleApiError(error)
  }
}
