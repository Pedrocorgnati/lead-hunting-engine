import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getProxyPool } from '@/lib/workers/providers/proxy-pool'

export async function GET() {
  try {
    await requireAdmin()
    const pool = getProxyPool()
    return successResponse(pool.status())
  } catch (error) {
    return handleApiError(error)
  }
}
