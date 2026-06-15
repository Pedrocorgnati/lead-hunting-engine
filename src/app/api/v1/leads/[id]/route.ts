import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'
import { LeadPatchSchema } from '@/lib/schemas/lead'
import { trackLeadChanges } from '@/lib/intelligence/enrichment/enrichers/history-tracker'
// M12-B5: state machine + side-effects centralizados em transitions.ts
import {
  asStatus,
  computeStatusSideEffects,
  InvalidTransitionError,
  isValidTransition,
  type LeadStatusValue,
} from '@/lib/lead/transitions'
import type { Lead } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await leadService.findById(id, user.id)

    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    return successResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const raw = await request.json()
    const data = LeadPatchSchema.parse(raw)

    // RLS: admin pode editar qualquer lead; demais só os próprios
    const whereOwnership =
      user.role === 'ADMIN' ? { id } : { id, userId: user.id }

    const existing = await prisma.lead.findFirst({
      where: whereOwnership,
    })
    if (!existing) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    // M12-B5: validar transicao + side-effects canonicos (alinha com leadService.updateStatus)
    const updateData: Record<string, unknown> = { ...data }

    if (data.status) {
      const fromStatus = asStatus(existing.status)
      const toStatus = data.status as LeadStatusValue

      // M12-B5 round 2 (Codex caught): same-status idempotente — remover do payload
      // para nao regravar contactedAt/retentionUntil em retry/reenvio.
      if (fromStatus === toStatus) {
        delete updateData.status
      } else {
        if (!isValidTransition(fromStatus, toStatus)) {
          throw new InvalidTransitionError(fromStatus, toStatus)
        }
        const sideEffects = computeStatusSideEffects(toStatus)
        if (sideEffects.contactedAt) updateData.contactedAt = sideEffects.contactedAt
        // retentionUntil sempre canonico (terminais + DISQUALIFIED -> data; ativos -> null)
        updateData.retentionUntil = sideEffects.retentionUntil
      }
    }

    // Se updateData ficou sem campos efetivos (so status idempotente removido), retorna existing.
    if (Object.keys(updateData).length === 0) {
      return successResponse(existing)
    }

    // outreach-engine (06-10, fix da revisao): transicao de status com guard
    // ATOMICO. Antes era read-modify-write (findFirst -> update by id), que
    // corria com o worker de outreach (lead-status-bridge) e podia sobrescrever
    // uma transicao ja aplicada com estado stale. updateMany guarded por
    // {id, status: fromStatus} faz a transicao PERDER (count=0 -> 409) em vez
    // de regredir o estado.
    if (data.status && updateData.status) {
      const fromStatus = asStatus(existing.status)
      const res = await prisma.lead.updateMany({
        where: { ...whereOwnership, status: fromStatus },
        data: updateData as never,
      })
      if (res.count === 0) {
        return NextResponse.json(
          {
            error: {
              code: 'LEAD_CONFLICT',
              message: 'O status do lead mudou em outra operação. Recarregue e tente novamente.',
            },
          },
          { status: 409 },
        )
      }
    } else {
      await prisma.lead.update({ where: { id }, data: updateData as never })
    }

    const updated = (await prisma.lead.findUnique({ where: { id } })) as Lead

    // TASK-5: registrar mudancas em lead_history (best-effort, nao quebra response)
    await trackLeadChanges(
      id,
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    )

    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
