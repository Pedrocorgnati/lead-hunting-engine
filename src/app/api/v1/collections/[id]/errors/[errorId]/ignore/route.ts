import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { getOwnedJob, loadErrors, markStatus, persistErrorList } from '../../_error-actions'

/**
 * POST /api/v1/collections/[id]/errors/[errorId]/ignore
 *
 * Marca um erro como ignorado de forma PERSISTENTE (status='ignored' gravado
 * no errorLog — sobrevive a reload) + audit log. 404 para job/erro ausentes.
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

    await persistErrorList(id, markStatus(errors, new Set([errorId]), 'ignored'))

    await AuditService.log({
      userId: user.id,
      action: 'collection_error.ignored',
      resource: 'collection_job',
      resourceId: id,
      metadata: { errorId, code: target.code },
    })

    return successResponse({ jobId: id, errorId, ignored: true })
  } catch (error) {
    return handleApiError(error)
  }
}
