import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const DndBodySchema = z.object({
  start: z.string().regex(TIME_RE).nullable().optional(),
  end: z.string().regex(TIME_RE).nullable().optional(),
})

export async function GET() {
  try {
    const user = await requireAuth()

    const rows = await (prisma as unknown as {
      notificationPreference: {
        findMany: (args: { where: { userId: string } }) =>
          Promise<Array<{ doNotDisturbStart: string | null; doNotDisturbEnd: string | null }>>
      }
    }).notificationPreference.findMany({ where: { userId: user.id } })

    // Se qualquer row tiver DND configurado, usamos o primeiro encontrado
    // como valor global do usuario (simplificacao pragmatica).
    const first = rows.find((r) => r.doNotDisturbStart || r.doNotDisturbEnd)

    return successResponse({
      start: first?.doNotDisturbStart ?? null,
      end: first?.doNotDisturbEnd ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const validated = DndBodySchema.parse(body)

    const start = validated.start === undefined ? undefined : validated.start
    const end = validated.end === undefined ? undefined : validated.end

    // Aplica DND em todas as preferencias do usuario (global por usuario).
    await (prisma as unknown as {
      notificationPreference: {
        updateMany: (args: { where: { userId: string }; data: Record<string, unknown> }) => Promise<unknown>
      }
    }).notificationPreference.updateMany({
      where: { userId: user.id },
      data: {
        doNotDisturbStart: start === undefined ? undefined : start,
        doNotDisturbEnd: end === undefined ? undefined : end,
      },
    })

    return successResponse({ start: start ?? null, end: end ?? null })
  } catch (error) {
    return handleApiError(error)
  }
}
