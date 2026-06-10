import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { apiSuccessFull } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { collectionLiveStatus, type CollectionStatus } from '@/lib/live-status'

/**
 * GET /api/v1/collections/:id/progress
 *
 * Progresso live da coleta no contrato canonico (item 048): payload inclui
 * `live` (LiveStatusContract — pollAfter/retryAfterMs/statusLabel/aria) para
 * o cliente reutilizavel useLivePoll honrar cadencia e retry do servidor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        status: true,
        progress: true,
        processedLeads: true,
        resultCount: true,
        totalEstimated: true,
        currentSource: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    })
    if (!job) {
      return NextResponse.json(
        { error: { code: 'JOB_404', message: 'Coleta nao encontrada.' } },
        { status: 404 },
      )
    }

    const live = collectionLiveStatus(job.status as CollectionStatus, job.updatedAt.toISOString())

    // Envelope C13 completo (item 064): data + meta (requestId/serverTime).
    return apiSuccessFull(
      {
        id: job.id,
        status: job.status,
        progress: job.progress,
        processedLeads: job.processedLeads,
        resultCount: job.resultCount,
        totalEstimated: job.totalEstimated,
        currentSource: job.currentSource,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        live,
      },
      200,
      { requestId: crypto.randomUUID(), lastUpdatedAt: job.updatedAt.toISOString() },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
