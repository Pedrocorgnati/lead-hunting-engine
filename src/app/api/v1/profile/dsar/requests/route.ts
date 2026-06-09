import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { DELETION_CANCEL_WINDOW_MS } from '@/lib/constants/profile'

type DsarRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'

interface DsarRequest {
  requestId: string
  type: 'EXPORT' | 'DELETION'
  requestedAt: string
  status: DsarRequestStatus
  completedAt: string | null
  downloadUrl?: string
  cancelAllowed?: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export async function GET() {
  try {
    const user = await requireAuth()

    const [profile, logs] = await Promise.all([
      prisma.userProfile.findUnique({
        where: { id: user.id },
        select: { deletionRequestedAt: true },
      }),
      prisma.auditLog.findMany({
        where: {
          userId: user.id,
          action: {
            in: [
              'profile.data_export_requested',
              'profile.data_exported',
              'user.deletion_requested',
              'user.deletion_cancelled',
              'user.deletion_completed',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    const deletionCancels = logs.filter((log) => log.action === 'user.deletion_cancelled')
    const deletionCompletions = logs.filter((log) => log.action === 'user.deletion_completed')

    const requests: DsarRequest[] = logs
      .filter((log) => log.action !== 'user.deletion_cancelled' && log.action !== 'user.deletion_completed')
      .map((log) => {
        const metadata = asRecord(log.metadata)

        if (log.action === 'user.deletion_requested') {
          const cancel = deletionCancels.find((entry) => entry.createdAt >= log.createdAt)
          const completion = deletionCompletions.find((entry) => entry.createdAt >= log.createdAt)
          const requestedAt = log.createdAt.toISOString()
          const active =
            profile?.deletionRequestedAt &&
            Math.abs(profile.deletionRequestedAt.getTime() - log.createdAt.getTime()) < 5000
          const cancelAllowed =
            Boolean(active) && Date.now() - log.createdAt.getTime() <= DELETION_CANCEL_WINDOW_MS

          return {
            requestId: log.id,
            type: 'DELETION',
            requestedAt,
            status: completion ? 'COMPLETED' : cancel ? 'CANCELLED' : active ? 'PROCESSING' : 'PROCESSING',
            completedAt: (completion ?? cancel)?.createdAt.toISOString() ?? null,
            cancelAllowed,
          }
        }

        const completedAt = stringOrNull(metadata.completed_at) ?? log.createdAt.toISOString()
        return {
          requestId: log.id,
          type: 'EXPORT',
          requestedAt: log.createdAt.toISOString(),
          status: 'COMPLETED',
          completedAt,
          downloadUrl: `/api/v1/profile/dsar/${log.id}/download`,
        }
      })

    return NextResponse.json({ data: { requests } })
  } catch (error) {
    return handleApiError(error)
  }
}
