import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getAllAlertThresholds,
  setConfig,
  type SystemConfigKey,
} from '@/lib/services/system-config'
import { AuditService } from '@/lib/services/audit-service'

/**
 * Admin endpoint para ler/atualizar thresholds de alerta sem redeploy.
 *
 * Origem: TASK-13 intake-review / ST002 (CL-124).
 */

const BodySchema = z
  .object({
    llmMonthlyUsd: z.number().positive().max(1_000_000).optional(),
    apiDailyCalls: z.number().int().positive().max(10_000_000).optional(),
    jobStuckMinutes: z.number().int().positive().max(1440).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Informe pelo menos um threshold',
  })

export async function GET() {
  try {
    await requireAdmin()
    const thresholds = await getAllAlertThresholds()
    return successResponse(thresholds)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const body = await request.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return handleApiError(parsed.error)
    }

    const updates: Array<[SystemConfigKey, { threshold: number }]> = []
    if (parsed.data.llmMonthlyUsd !== undefined)
      updates.push(['alert.llm.monthly_usd', { threshold: parsed.data.llmMonthlyUsd }])
    if (parsed.data.apiDailyCalls !== undefined)
      updates.push(['alert.api.daily_calls', { threshold: parsed.data.apiDailyCalls }])
    if (parsed.data.jobStuckMinutes !== undefined)
      updates.push(['alert.job.stuck_minutes', { threshold: parsed.data.jobStuckMinutes }])

    await Promise.all(updates.map(([key, value]) => setConfig(key, value, admin.id)))

    try {
      await AuditService.log({
        userId: admin.id,
        action: 'admin.alerts_thresholds_updated',
        resource: 'system_config',
        resourceId: 'alerts',
        metadata: Object.fromEntries(
          Object.entries(parsed.data).map(([k, v]) => [k, v as number])
        ),
      })
    } catch {
      // AuditLog failure nao deve bloquear a operacao
    }

    const thresholds = await getAllAlertThresholds()
    return successResponse(thresholds)
  } catch (error) {
    return handleApiError(error)
  }
}
