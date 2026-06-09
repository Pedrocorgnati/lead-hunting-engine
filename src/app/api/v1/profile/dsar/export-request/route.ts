import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    assertRateLimit(`profile:dsar:export-request:${user.id}`, 1, 60 * 60)

    const now = new Date()
    const audit = await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'profile.data_export_requested',
        resource: 'user_profiles',
        resourceId: user.id,
        ipAddress: getClientIp(request),
        metadata: {
          status: 'COMPLETED',
          completed_at: now.toISOString(),
          channel: 'self_service_privacy_page',
        },
      },
    })

    const response = {
      requestId: audit.id,
      type: 'EXPORT' as const,
      requestedAt: audit.createdAt.toISOString(),
      status: 'COMPLETED' as const,
      completedAt: now.toISOString(),
      downloadUrl: `/api/v1/profile/dsar/${audit.id}/download`,
    }

    return NextResponse.json({ data: { request: response } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
