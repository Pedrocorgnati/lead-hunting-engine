import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/v1/push/subscribe (TASK-7 / CL-138)
 *
 * Registra (upsert) uma PushSubscription do browser para o usuario autenticado.
 * O client envia `{ endpoint, keys: { p256dh, auth } }` obtido via
 * `navigator.serviceWorker.pushManager.subscribe(...)`.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const json = await request.json()
    const parsed = subscribeSchema.safeParse(json)
    if (!parsed.success) {
      return Response.json(
        { error: { code: 'VALIDATION_001', message: 'Payload invalido' } },
        { status: 400 },
      )
    }
    const { endpoint, keys, userAgent } = parsed.data
    const client = prisma as unknown as {
      pushSubscription: {
        upsert: (args: {
          where: { endpoint: string }
          create: Record<string, unknown>
          update: Record<string, unknown>
        }) => Promise<{ id: string }>
      }
    }
    const row = await client.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
    })
    return successResponse({ id: row.id })
  } catch (error) {
    return handleApiError(error)
  }
}
