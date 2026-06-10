import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getCronJob, isCronPaused, setCronPaused } from '@/lib/cron/registry'
import { AuditService } from '@/lib/services/audit-service'

const BodySchema = z.object({
  action: z.enum(['pause', 'resume']),
})

/**
 * PATCH /api/v1/admin/cron/jobs/{id}
 *
 * Pausa/retoma um cron job. O pause e persistido em SystemConfig
 * (`cron.paused.{id}`) e respeitado pelos proprios cron routes (que viram
 * no-op com `{skipped:true}` enquanto pausados — o agendador da Vercel nao
 * tem pause dinamico). RBAC: ADMIN.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    const job = getCronJob(id)
    if (!job) {
      return NextResponse.json(
        { error: { code: 'CRON_NOT_FOUND', message: 'Cron job nao encontrado.' } },
        { status: 404 },
      )
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})))
    const paused = body.action === 'pause'

    const already = await isCronPaused(id)
    if (already === paused) {
      return successResponse({ id, status: paused ? 'DISABLED' : 'ACTIVE', changed: false })
    }

    await setCronPaused(id, paused, admin.id)
    await AuditService.log({
      userId: admin.id,
      action: paused ? 'cron.paused' : 'cron.resumed',
      resource: 'cron_job',
      resourceId: id,
    })

    return successResponse({ id, status: paused ? 'DISABLED' : 'ACTIVE', changed: true })
  } catch (error) {
    return handleApiError(error)
  }
}
