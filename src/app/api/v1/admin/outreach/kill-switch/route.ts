/**
 * outreach-engine (brainstorm 06-10, tasks 01/11): kill-switch global de
 * outbound. enabled=false (estado seguro) bloqueia TODO envio. Toda mudanca
 * gera trilha de auditoria (Aceite task 16: alteracao de gate audita).
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getOutreachKillSwitch, getOutreachDryRun, setConfig } from '@/lib/services/system-config'
import { AuditService } from '@/lib/services/audit-service'
import { track, makeCorrelationId } from '@/lib/telemetry'

const BodySchema = z.object({
  enabled: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  reason: z.string().min(3).max(500),
})

export async function GET() {
  try {
    await requireAdmin()
    const [killSwitch, dryRun] = await Promise.all([getOutreachKillSwitch(), getOutreachDryRun()])
    return successResponse({ killSwitch: killSwitch.enabled, dryRun: dryRun.enabled })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)

    if (parsed.data.enabled !== undefined) {
      await setConfig('outreach.kill_switch', { enabled: parsed.data.enabled }, admin.id)
    }
    if (parsed.data.dryRun !== undefined) {
      await setConfig('outreach.dry_run', { enabled: parsed.data.dryRun }, admin.id)
    }

    await AuditService.log({
      userId: admin.id,
      action: 'outreach.killswitch_toggled',
      resource: 'outreach',
      metadata: {
        enabled: parsed.data.enabled ?? null,
        dryRun: parsed.data.dryRun ?? null,
        reason: parsed.data.reason,
      },
    })
    void track({
      kind: 'outreach.killswitch_toggled',
      correlationId: makeCorrelationId('killswitch'),
      userId: admin.id,
      resourceType: 'outreach',
      metadata: { enabled: parsed.data.enabled, dryRun: parsed.data.dryRun },
    })

    const [killSwitch, dryRun] = await Promise.all([getOutreachKillSwitch(), getOutreachDryRun()])
    return successResponse({ killSwitch: killSwitch.enabled, dryRun: dryRun.enabled })
  } catch (error) {
    return handleApiError(error)
  }
}
