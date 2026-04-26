import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  ALL_CHANNELS,
  DEFAULT_CHANNELS,
  type NotificationChannel,
} from '@/lib/notifications/dispatcher'
import { NOTIFICATION_EVENTS, type NotificationEventKey } from '@/lib/notifications/copy'

/**
 * GET  /api/v1/notifications/preferences
 *   -> { data: { [event]: NotificationChannel[] } }  (default = DEFAULT_CHANNELS para eventos sem row)
 *
 * PATCH /api/v1/notifications/preferences
 *   body: { [event]: NotificationChannel[] }  (upsert por evento)
 *   -> retorna matriz atualizada
 */

type PrefMap = Record<NotificationEventKey, NotificationChannel[]>

const ChannelSchema = z.enum(['push', 'email', 'in-app'])
const EventKeySchema = z.enum(NOTIFICATION_EVENTS as [NotificationEventKey, ...NotificationEventKey[]])
const PatchBodySchema = z.record(EventKeySchema, z.array(ChannelSchema))

function emptyMatrix(): PrefMap {
  return NOTIFICATION_EVENTS.reduce<PrefMap>((acc, ev) => {
    acc[ev] = [...DEFAULT_CHANNELS]
    return acc
  }, {} as PrefMap)
}

export async function GET() {
  try {
    const user = await requireAuth()

    const rows = await (prisma as unknown as {
      notificationPreference: {
        findMany: (args: { where: { userId: string } }) =>
          Promise<Array<{ event: string; channels: string[] }>>
      }
    }).notificationPreference.findMany({ where: { userId: user.id } })

    const matrix = emptyMatrix()
    for (const row of rows) {
      if ((NOTIFICATION_EVENTS as string[]).includes(row.event)) {
        const channels = row.channels.filter((c): c is NotificationChannel =>
          (ALL_CHANNELS as string[]).includes(c)
        )
        matrix[row.event as NotificationEventKey] = channels
      }
    }

    return successResponse(matrix)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const validated = PatchBodySchema.parse(body)

    const entries = Object.entries(validated) as Array<[NotificationEventKey, NotificationChannel[]]>

    await Promise.all(
      entries.map(([event, channels]) =>
        (prisma as unknown as {
          notificationPreference: {
            upsert: (args: {
              where: { userId_event: { userId: string; event: string } }
              create: { userId: string; event: string; channels: string[] }
              update: { channels: string[] }
            }) => Promise<unknown>
          }
        }).notificationPreference.upsert({
          where: { userId_event: { userId: user.id, event } },
          create: { userId: user.id, event, channels },
          update: { channels },
        })
      )
    )

    // Retorna matriz atualizada completa
    const rows = await (prisma as unknown as {
      notificationPreference: {
        findMany: (args: { where: { userId: string } }) =>
          Promise<Array<{ event: string; channels: string[] }>>
      }
    }).notificationPreference.findMany({ where: { userId: user.id } })

    const matrix = emptyMatrix()
    for (const row of rows) {
      if ((NOTIFICATION_EVENTS as string[]).includes(row.event)) {
        const channels = row.channels.filter((c): c is NotificationChannel =>
          (ALL_CHANNELS as string[]).includes(c)
        )
        matrix[row.event as NotificationEventKey] = channels
      }
    }

    return successResponse(matrix)
  } catch (error) {
    return handleApiError(error)
  }
}
