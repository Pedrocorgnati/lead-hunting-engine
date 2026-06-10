import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const BodySchema = z.object({
  channel: z.enum(['push', 'email', 'in-app']).optional().default('push'),
})

/**
 * POST /api/v1/notifications/:id/delivery-receipt (item 072 / C15)
 *
 * Recibo de entrega reportado pelo client (service worker / app) quando a
 * notificacao chega ao dispositivo. Idempotente: o primeiro recibo grava
 * deliveredAt/deliveryChannel; os seguintes retornam o estado existente.
 * Ownership obrigatorio (notificacao de outro usuario -> 404).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = BodySchema.parse(await request.json().catch(() => ({})))

    const notification = await prisma.notification.findFirst({
      where: { id, userId: user.id },
      select: { id: true, deliveredAt: true, deliveryChannel: true },
    })
    if (!notification) {
      return NextResponse.json(
        { error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notificacao nao encontrada.' } },
        { status: 404 },
      )
    }

    if (notification.deliveredAt) {
      return successResponse({
        id,
        delivered: true,
        deliveredAt: notification.deliveredAt.toISOString(),
        channel: notification.deliveryChannel,
        alreadyRecorded: true,
      })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { deliveredAt: new Date(), deliveryChannel: body.channel },
      select: { deliveredAt: true, deliveryChannel: true },
    })

    return successResponse({
      id,
      delivered: true,
      deliveredAt: updated.deliveredAt!.toISOString(),
      channel: updated.deliveryChannel,
      alreadyRecorded: false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
