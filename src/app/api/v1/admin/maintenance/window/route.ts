import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getMaintenanceWindowConfig,
  saveMaintenanceWindowConfig,
  type MaintenanceWindowConfig,
} from '@/lib/maintenance-window'
import { AuditService, type AuditAction } from '@/lib/services/audit-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const IsoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Data invalida.',
  })
  .transform((value) => new Date(value).toISOString())

const BodySchema = z
  .object({
    enabled: z.boolean().default(true),
    reason: z.string().trim().min(3).max(160),
    message: z.string().trim().min(3).max(500),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    startsAt: IsoDateSchema.optional(),
    endsAt: IsoDateSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const startsAt = value.startsAt ? new Date(value.startsAt).getTime() : Date.now()
    const endsAt = value.endsAt ? new Date(value.endsAt).getTime() : null
    if (endsAt !== null && endsAt <= startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'endsAt deve ser posterior a startsAt.',
      })
    }
  })

function getIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}

function getAuditAction(window: MaintenanceWindowConfig, now = new Date()): AuditAction {
  if (!window.enabled) return 'maintenance.window_deactivated'
  if (new Date(window.startsAt).getTime() > now.getTime()) return 'maintenance.window_scheduled'
  return 'maintenance.window_activated'
}

export async function GET() {
  try {
    await requireAdmin()
    const window = await getMaintenanceWindowConfig()
    return successResponse({ window })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const body = BodySchema.parse(await request.json().catch(() => ({})))
    const now = new Date()
    const current = await getMaintenanceWindowConfig()
    const window: MaintenanceWindowConfig = {
      enabled: body.enabled,
      reason: body.reason,
      message: body.message,
      severity: body.severity,
      startsAt: body.startsAt ?? now.toISOString(),
      endsAt: body.endsAt ?? null,
      updatedAt: now.toISOString(),
      updatedBy: admin.id,
      bannerPublishedAt: current.bannerPublishedAt,
    }

    await saveMaintenanceWindowConfig(window, admin.id)
    await AuditService.log({
      userId: admin.id,
      action: getAuditAction(window, now),
      resource: 'maintenance_window',
      metadata: {
        enabled: window.enabled,
        reason: window.reason,
        severity: window.severity,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return successResponse({ window }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const current = await getMaintenanceWindowConfig()
    const now = new Date()
    const window: MaintenanceWindowConfig = {
      ...current,
      enabled: false,
      updatedAt: now.toISOString(),
      updatedBy: admin.id,
      bannerPublishedAt: null,
    }

    await saveMaintenanceWindowConfig(window, admin.id)
    await AuditService.log({
      userId: admin.id,
      action: 'maintenance.window_cancelled',
      resource: 'maintenance_window',
      metadata: {
        reason: current.reason,
        severity: current.severity,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
      },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ data: { window: null } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
