import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * POST /api/v1/notifications/read-all
 *   -> marca todas as notificacoes nao lidas do usuario como lidas.
 *
 * Origem: INTAKE-REVIEW TASK-9 / CL-136.
 */

export async function POST() {
  try {
    const user = await requireAuth()

    const result = await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    })

    return successResponse({ updated: result.count })
  } catch (error) {
    return handleApiError(error)
  }
}
