import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getCronJob, recordCronRun } from '@/lib/cron/registry'
import { CRON_RUNNERS } from '@/lib/cron/runners'
import { AuditService } from '@/lib/services/audit-service'
import { captureException } from '@/lib/observability/sentry'

/**
 * POST /api/v1/admin/cron/jobs/{id}/trigger
 *
 * Aciona manualmente um cron job do registry, executando a MESMA funcao que o
 * handler do cron route invoca (sem passar pelo CRON_SECRET — a autorizacao
 * aqui e RBAC ADMIN). Registra last-run e audit trail. RBAC: ADMIN.
 *
 * Consumido por AD29 /admin/jobs/cron (botao "Acionar").
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    const job = getCronJob(id)
    const runner = CRON_RUNNERS[id]
    if (!job || !runner) {
      return NextResponse.json(
        { error: { code: 'CRON_NOT_FOUND', message: 'Cron job nao encontrado.' } },
        { status: 404 },
      )
    }

    let result: unknown
    try {
      result = await runner()
      await recordCronRun(id, 'ok')
    } catch (err) {
      await recordCronRun(id, 'error')
      captureException(err, { layer: 'cron-manual-trigger', job: id })
      await AuditService.log({
        userId: admin.id,
        action: 'cron.triggered_manually',
        resource: 'cron_job',
        resourceId: id,
        metadata: { outcome: 'error', error: (err as Error).message ?? String(err) },
      })
      return NextResponse.json(
        {
          error: {
            code: 'CRON_RUN_FAILED',
            message: `Execucao manual de "${job.name}" falhou: ${(err as Error).message ?? 'erro desconhecido'}`,
          },
        },
        { status: 502 },
      )
    }

    await AuditService.log({
      userId: admin.id,
      action: 'cron.triggered_manually',
      resource: 'cron_job',
      resourceId: id,
      metadata: { outcome: 'ok' },
    })

    return successResponse({ id, triggeredAt: new Date().toISOString(), result })
  } catch (error) {
    return handleApiError(error)
  }
}
