import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getMaintenanceWindowConfig,
  saveMaintenanceWindowConfig,
  type MaintenanceWindowConfig,
} from '@/lib/maintenance-window'
import { AuditService } from '@/lib/services/audit-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BodySchema = z.object({
  message: z.string().trim().min(3).max(500).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
})

function getIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const body = BodySchema.parse(await request.json().catch(() => ({})))
    const current = await getMaintenanceWindowConfig()

    if (!current.enabled) {
      return NextResponse.json(
        {
          error: {
            code: 'MAINTENANCE_WINDOW_NOT_ACTIVE',
            message: 'Nao ha janela de manutencao ativa ou agendada para publicar.',
          },
        },
        { status: 404 },
      )
    }

    const now = new Date()
    const window: MaintenanceWindowConfig = {
      ...current,
      message: body.message ?? current.message,
      severity: body.severity ?? current.severity,
      updatedAt: now.toISOString(),
      updatedBy: admin.id,
      bannerPublishedAt: now.toISOString(),
    }

    await saveMaintenanceWindowConfig(window, admin.id)
    await AuditService.log({
      userId: admin.id,
      action: 'maintenance.banner_published',
      resource: 'maintenance_window',
      metadata: {
        reason: window.reason,
        severity: window.severity,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bannerPublishedAt: window.bannerPublishedAt,
      },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return successResponse({ window })
  } catch (error) {
    return handleApiError(error)
  }
}
