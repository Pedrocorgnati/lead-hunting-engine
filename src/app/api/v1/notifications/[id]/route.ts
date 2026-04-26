import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

const IdSchema = z.string().uuid('ID invalido')

/**
 * DELETE /api/v1/notifications/[id]
 *
 * Remove uma notificacao propria do usuario autenticado.
 * Retorna 404 se nao existir ou pertencer a outro usuario (nao vazar existencia).
 *
 * Origem: TASK-6 intake-review / CL-497.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const validId = IdSchema.parse(id)

    const result = await prisma.notification.deleteMany({
      where: { id: validId, userId: user.id },
    })

    if (result.count === 0) {
      return successResponse({ ok: false, reason: 'not_found_or_forbidden' }, 404)
    }

    return successResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
