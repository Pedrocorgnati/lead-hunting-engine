import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { dispatch } from '@/lib/notifications/dispatcher'

const TestBodySchema = z.object({
  token: z.string().trim().max(512).optional(),
}).optional()

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json().catch(() => ({}))
    const validated = TestBodySchema.parse(body)

    const correlationId = crypto.randomUUID()

    // Dispara notificacao de teste via dispatcher (cria in-app + tenta push/email).
    await dispatch({
      event: 'CONTACT_MESSAGE_RECEIVED',
      userId: user.id,
      title: 'Notificacao de teste',
      message: 'Esta e uma notificacao de teste enviada pelas preferencias.',
      data: { test: true, correlationId, tokenHint: validated?.token ? `${validated.token.slice(0, 8)}...` : null },
    })

    // Se token foi enviado, registra audit log para rastreabilidade C15.
    if (validated?.token) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'notification.test_sent',
          resource: 'notification',
          resourceId: user.id,
          metadata: { correlationId, tokenLength: validated.token.length },
        },
      })
    }

    return successResponse({ sent: true, correlationId })
  } catch (error) {
    return handleApiError(error)
  }
}
