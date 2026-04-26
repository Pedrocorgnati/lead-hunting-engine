import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * GET /api/v1/jobs/[id]/cost
 *
 * Retorna custo agregado do job:
 *   - LLM: soma costUsd, tokens (kind=LLM)
 *   - API: contagem por provider/callType
 *
 * Origem: TASK-12 intake-review / ST001.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findUnique({
      where: { id },
      select: { id: true, userId: true, name: true, status: true },
    })
    if (!job || job.userId !== user.id) {
      return NextResponse.json(
        { error: { code: 'JOB_080', message: 'Coleta nao encontrada.' } },
        { status: 404 }
      )
    }

    const [llm, api] = await Promise.all([
      prisma.apiUsageLog.aggregate({
        where: { jobId: id, kind: 'LLM' },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.apiUsageLog.groupBy({
        by: ['provider', 'callType'],
        where: { jobId: id, kind: 'API' },
        _sum: { creditCost: true },
        _count: { _all: true },
      }),
    ])

    return successResponse({
      jobId: id,
      llm: {
        calls: llm._count._all,
        costUsd: llm._sum.costUsd?.toString() ?? '0',
        inputTokens: llm._sum.inputTokens ?? 0,
        outputTokens: llm._sum.outputTokens ?? 0,
      },
      api: api.map((row) => ({
        provider: row.provider,
        callType: row.callType,
        calls: row._count._all,
        credits: row._sum.creditCost ?? 0,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
