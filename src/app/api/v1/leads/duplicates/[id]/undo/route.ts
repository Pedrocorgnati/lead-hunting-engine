import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { isWithinUndoWindow } from '@/lib/intelligence/dedup-config'

interface MergeSnapshot {
  primary: Record<string, unknown>
  loser: Record<string, unknown>
  mergedAt: string
  mergedBy: string
}

/**
 * POST /api/v1/leads/duplicates/[id]/undo
 *
 * Restaura ambos os leads ao estado pre-merge desde que a janela de undo
 * (DEDUP_UNDO_WINDOW_DAYS, default 7) ainda esteja aberta. Grava AuditLog.
 *
 * Origem: TASK-9 intake-review / CL-225.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const candidate = await prisma.duplicateCandidate.findUnique({ where: { id } })
    if (!candidate || candidate.userId !== user.id) {
      return NextResponse.json(
        { error: { code: 'DUP_404', message: 'Candidato nao encontrado.' } },
        { status: 404 }
      )
    }
    if (candidate.status !== 'MERGED') {
      return NextResponse.json(
        {
          error: {
            code: 'DUP_409',
            message: 'Apenas merges podem ser desfeitos.',
          },
        },
        { status: 409 }
      )
    }
    if (!isWithinUndoWindow(candidate.mergedAt)) {
      return NextResponse.json(
        {
          error: {
            code: 'DUP_410',
            message: 'Janela de undo expirou.',
          },
        },
        { status: 410 }
      )
    }

    const snapshot = candidate.mergeSnapshot as unknown as MergeSnapshot | null
    if (!snapshot?.primary || !snapshot?.loser) {
      return NextResponse.json(
        { error: { code: 'DUP_500', message: 'Snapshot ausente.' } },
        { status: 500 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: String(snapshot.primary.id) },
        data: snapshot.primary as object,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.lead.create({ data: snapshot.loser as any })
      await tx.duplicateCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'UNDONE',
          undoneAt: new Date(),
          undoneBy: user.id,
        },
      })
    })

    await AuditService.log({
      userId: user.id,
      action: 'lead.duplicates_undo_merge',
      resource: 'duplicate_candidate',
      resourceId: candidate.id,
      metadata: {
        primaryLeadId: candidate.primaryLeadId,
        loserLeadId: candidate.candidateLeadId,
      },
    })

    return successResponse({ id: candidate.id, status: 'UNDONE' })
  } catch (error) {
    return handleApiError(error)
  }
}
