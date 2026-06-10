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
} from '../../_error-actions'

/**
 * POST /api/v1/collections/[id]/errors/[errorId]/retry
 *
 * Reprocessa UM erro especifico da coleta:
 *  - 404 se job/erro nao existem (ownership por userId);
 *  - 422 se o erro nao e retryavel (front mapeia ERROR_NOT_RETRYABLE);
 *  - 409 se o job ja esta em processamento ou em estado terminal;
 *  - sucesso: persiste status='retried' no errorLog + dispara reprocessamento
 *    real (resume ou child job) + audit log.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; errorId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, errorId } = await params

    const job = await getOwnedJob(user.id, id)
    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Coleta nao encontrada.' } },
        { status: 404 },
      )
    }

    const errors = loadErrors(job)
    const target = errors.find((e) => e.errorId === errorId)
    if (!target) {
      return NextResponse.json(
        { error: { code: 'ERROR_NOT_FOUND', message: 'Erro nao encontrado nesta coleta.' } },
        { status: 404 },
      )
    }
    if (!target.retryable) {
      return NextResponse.json(
        {
          error: {
            code: 'ERROR_NOT_RETRYABLE',
            message: 'Este erro nao e retryavel; corrija a causa raiz antes de tentar novamente.',
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

    await persistErrorList(id, markStatus(errors, new Set([errorId]), 'retried'))

    await AuditService.log({
      userId: user.id,
      action: 'collection_error.retried',
      resource: 'collection_job',
      resourceId: id,
      metadata: {
        errorId,
        code: target.code,
        mode: outcome.mode,
        ...(outcome.mode === 'child' ? { childJobId: outcome.childJobId } : {}),
      },
    })

    return successResponse({
      jobId: id,
      errorId,
      retried: true,
      mode: outcome.mode,
      ...(outcome.mode === 'child' ? { childJobId: outcome.childJobId } : {}),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
