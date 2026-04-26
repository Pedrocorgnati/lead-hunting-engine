import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * GET /api/v1/notifications/unread-count
 *   -> { data: { count: number } }
 *
 * Usado pelo badge no header. Origem: INTAKE-REVIEW TASK-9 / CL-136.
 */

export async function GET() {
  try {
    const user = await requireAuth()
    const count = await prisma.notification.count({
      where: { userId: user.id, read: false },
    })
    return successResponse({ count })
  } catch (error) {
    return handleApiError(error)
  }
}
