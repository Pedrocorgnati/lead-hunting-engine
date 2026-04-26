import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * POST /api/v1/notifications/[id]/read
 *   -> marca notificacao como lida (readAt = now). Idempotente.
 *
 * Origem: INTAKE-REVIEW TASK-9 / CL-136.
 */

const IdSchema = z.string().uuid('ID invalido')

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const validId = IdSchema.parse(id)

    // Garante RLS-like: so marca se pertencer ao usuario.
    const updated = await prisma.notification.updateMany({
      where: { id: validId, userId: user.id },
      data: { read: true, readAt: new Date() },
    })

    if (updated.count === 0) {
      return successResponse({ ok: false, reason: 'not_found_or_forbidden' }, 404)
    }

    const notification = await prisma.notification.findUnique({ where: { id: validId } })
    return successResponse(notification)
  } catch (error) {
    return handleApiError(error)
  }
}
