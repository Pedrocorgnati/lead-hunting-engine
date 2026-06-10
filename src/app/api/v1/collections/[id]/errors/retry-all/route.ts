import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import {
  getOwnedJob,
  loadErrors,
  markStatus,
  persistErrorList,
  requeueJob,
} from '../_error-actions'

/**
 * POST /api/v1/collections/[id]/errors/retry-all
 *
 * Reprocessa TODOS os erros pendentes e retryaveis da coleta:
 *  - 404 se job nao existe (ownership por userId);
 *  - 422 se nao ha nenhum erro pendente retryavel;
 *  - 409 se o job ja esta em processamento ou em estado terminal;
 *  - sucesso: persiste status='retried' nos elegiveis + UM reprocessamento
 *    real (resume ou child job) + audit log com contagem real.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await getOwnedJob(user.id, id)
    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Coleta nao encontrada.' } },
        { status: 404 },
      )
    }

    const errors = loadErrors(job)
    const eligible = errors.filter((e) => e.status === 'pending' && e.retryable)
    if (eligible.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_RETRYABLE_ERRORS',
            message: 'Nenhum erro pendente retryavel nesta coleta.',
          },
        },
        { status: 422 },
      )
    }

    const outcome = await requeueJob(job)
    if (outcome.mode === 'blocked') {
      const message =
        outcome.reason === 'in_progress'
          ? 'A coleta ja esta em processamento; aguarde a execucao atual.'
          : `Coleta em estado ${outcome.status} nao pode ser reprocessada por item; use o retry da coleta.`
      return NextResponse.json(
        { error: { code: 'JOB_NOT_REQUEUEABLE', message } },
        { status: 409 },
      )
    }

    const eligibleIds = new Set(eligible.map((e) => e.errorId))
    await persistErrorList(id, markStatus(errors, eligibleIds, 'retried'))

    await AuditService.log({
      userId: user.id,
      action: 'collection_error.retried_all',
      resource: 'collection_job',
      resourceId: id,
      metadata: {
        count: eligible.length,
        mode: outcome.mode,
        ...(outcome.mode === 'child' ? { childJobId: outcome.childJobId } : {}),
      },
    })

    return successResponse({
      jobId: id,
      retriedAll: true,
      count: eligible.length,
      mode: outcome.mode,
      ...(outcome.mode === 'child' ? { childJobId: outcome.childJobId } : {}),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
