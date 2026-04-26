import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'

const BodySchema = z.object({
  action: z.enum(['MERGE', 'KEEP_BOTH', 'REJECT']),
  primaryLeadId: z.string().uuid().optional(),
})

/**
 * POST /api/v1/leads/duplicates/[id]/resolve
 *
 * Body:
 *   { action: 'MERGE' | 'KEEP_BOTH' | 'REJECT', primaryLeadId?: uuid }
 *
 * Em MERGE: grava snapshot do par (pre-merge) em `merge_snapshot`,
 *           atualiza lead primary com campos ausentes do candidato,
 *           deleta o candidato (Lead) e marca status = MERGED.
 * Em KEEP_BOTH / REJECT: apenas transita estado + audit.
 *
 * Origem: TASK-9 intake-review / CL-224.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = BodySchema.parse(await request.json())

    const candidate = await prisma.duplicateCandidate.findUnique({
      where: { id },
    })
    if (!candidate || candidate.userId !== user.id) {
      return NextResponse.json(
        { error: { code: 'DUP_404', message: 'Candidato nao encontrado.' } },
        { status: 404 }
      )
    }
    if (candidate.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: {
            code: 'DUP_409',
            message: `Candidato ja resolvido (status=${candidate.status}).`,
          },
        },
        { status: 409 }
      )
    }

    if (body.action === 'MERGE') {
      const primaryId = body.primaryLeadId ?? candidate.primaryLeadId
      const loserId =
        primaryId === candidate.primaryLeadId
          ? candidate.candidateLeadId
          : candidate.primaryLeadId
      if (![candidate.primaryLeadId, candidate.candidateLeadId].includes(primaryId)) {
        return NextResponse.json(
          { error: { code: 'DUP_422', message: 'primaryLeadId invalido.' } },
          { status: 422 }
        )
      }

      const [primary, loser] = await Promise.all([
        prisma.lead.findUnique({ where: { id: primaryId } }),
        prisma.lead.findUnique({ where: { id: loserId } }),
      ])
      if (!primary || !loser) {
        return NextResponse.json(
          { error: { code: 'DUP_404', message: 'Lead inexistente.' } },
          { status: 404 }
        )
      }

      const snapshot = {
        primary,
        loser,
        mergedAt: new Date().toISOString(),
        mergedBy: user.id,
      }

      await prisma.$transaction(async (tx) => {
        // Preserva historico snapshot completo em LeadHistory.
        await tx.leadHistory.create({
          data: {
            leadId: primary.id,
            field: 'merge',
            oldValue: primary as unknown as object,
            newValue: { mergedFrom: loser.id },
            snapshot,
          },
        })

        // Merge simplificado: preenche campos nulos do primary com valores do loser.
        const patch: Record<string, unknown> = {}
        const keys: Array<keyof typeof primary> = [
          'phone',
          'email',
          'website',
          'category',
          'city',
          'state',
        ]
        for (const key of keys) {
          if (
            (primary[key] === null || primary[key] === undefined || primary[key] === '') &&
            loser[key]
          ) {
            patch[key as string] = loser[key]
          }
        }
        if (Object.keys(patch).length > 0) {
          await tx.lead.update({ where: { id: primary.id }, data: patch })
        }

        await tx.lead.delete({ where: { id: loser.id } })

        await tx.duplicateCandidate.update({
          where: { id: candidate.id },
          data: {
            status: 'MERGED',
            resolution: 'MERGE',
            resolvedBy: user.id,
            resolvedAt: new Date(),
            mergedAt: new Date(),
            mergedBy: user.id,
            mergeSnapshot: snapshot,
            primaryLeadId: primary.id,
            candidateLeadId: loser.id,
          },
        })
      })

      await AuditService.log({
        userId: user.id,
        action: 'lead.duplicates_merged',
        resource: 'duplicate_candidate',
        resourceId: candidate.id,
        metadata: {
          primaryLeadId: primaryId,
          loserLeadId: loserId,
          similarity: candidate.similarity,
        },
      })
    } else {
      const status = body.action === 'KEEP_BOTH' ? 'KEEP_BOTH' : 'REJECTED'
      await prisma.duplicateCandidate.update({
        where: { id: candidate.id },
        data: {
          status,
          resolution: body.action,
          resolvedBy: user.id,
          resolvedAt: new Date(),
        },
      })
      await AuditService.log({
        userId: user.id,
        action:
          body.action === 'KEEP_BOTH'
            ? 'lead.duplicates_kept_both'
            : 'lead.duplicates_rejected',
        resource: 'duplicate_candidate',
        resourceId: candidate.id,
        metadata: { similarity: candidate.similarity },
      })
    }

    return successResponse({ id: candidate.id, action: body.action })
  } catch (error) {
    return handleApiError(error)
  }
}
