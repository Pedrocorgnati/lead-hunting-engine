import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { applyAlertAction } from '@/lib/alerts/lifecycle'
import { AuditService, type AuditAction } from '@/lib/services/audit-service'

const BodySchema = z.object({
  action: z.enum(['silence', 'resolve', 'reopen']),
  snoozeHours: z.number().int().min(1).max(168).optional(),
})

const AUDIT_BY_ACTION: Record<'silence' | 'resolve' | 'reopen', AuditAction> = {
  silence: 'alert.silenced',
  resolve: 'alert.resolved',
  reopen: 'alert.reopened',
}

/**
 * PATCH /api/v1/admin/alerts/{id}
 *
 * Transiciona o lifecycle de um alerta operacional:
 *   silence (snooze de snoozeHours, default 24h) | resolve | reopen.
 * RBAC: ADMIN. Consumido por AD30 /admin/alertas.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const body = BodySchema.parse(await request.json().catch(() => ({})))

    const updated = await applyAlertAction(id, body.action, admin.id, body.snoozeHours ?? 24)
    if (!updated) {
      return NextResponse.json(
        { error: { code: 'ALERT_NOT_FOUND', message: 'Alerta nao encontrado.' } },
        { status: 404 },
      )
    }

    await AuditService.log({
      userId: admin.id,
      action: AUDIT_BY_ACTION[body.action],
      resource: 'sent_alert',
      resourceId: id,
      metadata: { rule: updated.rule, ...(body.action === 'silence' ? { snoozeHours: body.snoozeHours ?? 24 } : {}) },
    })

    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
