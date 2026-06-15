import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, tasks 02/09/22): ponte transacional
 * entre dispatch de envio e estado do lead.
 *
 * Por que nao usar leadService.updateStatus aqui: (a) workers nao tem sessao
 * Supabase; (b) updateStatus nao e guarded — duas transicoes concorrentes
 * (operador na UI + worker) podem race. Aqui toda transicao e
 * `updateMany({ where: { id, status: from } })`: o guard de status no WHERE
 * faz a transicao perder (count=0) em vez de sobrescrever estado stale.
 */
import { prisma } from '@/lib/prisma'
import type { Prisma, ContactOutcome } from '@prisma/client'
import {
  asStatus,
  computeStatusSideEffects,
  isValidTransition,
  outcomeTargetStatus,
  NEXT_ACTION_BY_OUTCOME,
  type ContactOutcomeValue,
  type LeadStatusValue,
} from '@/lib/lead/transitions'

type Tx = Prisma.TransactionClient

/**
 * Transicao guardada from->to. Retorna true se aplicou (count=1).
 * Valida o state machine ANTES (Zero Estados Indefinidos) e aplica os
 * side effects canonicos (contactedAt/retentionUntil).
 */
export async function guardedLeadTransition(
  tx: Tx,
  leadId: string,
  from: LeadStatusValue,
  to: LeadStatusValue,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isValidTransition(from, to) || from === to) return false
  const sideEffects = computeStatusSideEffects(to, now)
  const res = await tx.lead.updateMany({
    where: { id: leadId, status: from },
    data: {
      status: to,
      retentionUntil: sideEffects.retentionUntil,
      ...(sideEffects.contactedAt ? { contactedAt: sideEffects.contactedAt } : {}),
    },
  })
  return res.count === 1
}

export interface ConsistencyCheck {
  consistent: boolean
  leadStatus: LeadStatusValue | null
  lastOutcome: ContactOutcome | null
  detail?: string
}

/**
 * Regra de contingencia 9.1 do fonte (task 09): divergencia confirmada entre
 * Lead.status e o ContactEvent mais recente BLOQUEIA novas atualizacoes ate
 * reconciliacao. Divergencia = o ultimo outcome implica um target de
 * transicao automatica que ERA valido e nao foi aplicado (estado regrediu ou
 * update se perdeu).
 */
export async function checkLeadEventConsistency(leadId: string): Promise<ConsistencyCheck> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true },
  })
  if (!lead) return { consistent: true, leadStatus: null, lastOutcome: null, detail: 'lead ausente' }

  const lastEvent = await prisma.contactEvent.findFirst({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    select: { outcome: true, createdAt: true },
  })
  const leadStatus = asStatus(lead.status)
  if (!lastEvent) return { consistent: true, leadStatus, lastOutcome: null }

  const outcome = lastEvent.outcome as ContactOutcomeValue
  const mapping = NEXT_ACTION_BY_OUTCOME[outcome]
  if (!mapping || mapping.targetStatus === null) {
    return { consistent: true, leadStatus, lastOutcome: lastEvent.outcome }
  }

  // Divergencia real: o ultimo outcome deveria ter avancado o lead ate o
  // target, mas o lead esta ATRAS dele no funil — o update pos-envio se
  // perdeu (ex.: SENT => CONTACTED, lead segue NEW). Estados ADIANTE do
  // target (NEGOTIATING apos SENT) sao progresso legitimo; estados fora do
  // funil (terminais/laterais) nao sao avaliados.
  const target = mapping.targetStatus
  const divergent =
    leadStatus !== target &&
    isInFunnel(leadStatus) &&
    isInFunnel(target) &&
    funnelRank(leadStatus) < funnelRank(target)
  return {
    consistent: !divergent,
    leadStatus,
    lastOutcome: lastEvent.outcome,
    detail: divergent
      ? `ultimo outcome ${outcome} implica status ${target}, lead esta ${leadStatus}`
      : undefined,
  }
}

// Ordenacao do funil comercial para detectar regressao de estado.
const FUNNEL_ORDER: Partial<Record<LeadStatusValue, number>> = {
  NEW: 0,
  CONTACTED: 1,
  NEGOTIATING: 2,
  CONVERTED: 3,
}
function isInFunnel(s: LeadStatusValue): boolean {
  return s in FUNNEL_ORDER
}
function funnelRank(s: LeadStatusValue): number {
  return FUNNEL_ORDER[s] ?? -1
}

/**
 * Aplica o efeito de um outcome (envio ou resposta) de forma atomica:
 * ContactEvent + transicao guardada + nextAction sugerida em Lead.metadata.
 * Retorna o id do ContactEvent criado.
 */
export async function applyOutcome(params: {
  leadId: string
  userId: string
  channel: 'EMAIL' | 'WHATSAPP' | 'LINKEDIN' | 'TELEFONE'
  outcome: ContactOutcomeValue
  dispatchId?: string
  note?: string
  metadata?: Record<string, unknown>
  now?: Date
}): Promise<{ contactEventId: string; transitioned: boolean }> {
  const now = params.now ?? new Date()
  // ContactChannel nao tem LINKEDIN ate a migration rodar em todos os
  // ambientes; o enum ja foi estendido nesta migration (LINKEDIN existe).
  const channel = params.channel === 'LINKEDIN' ? 'LINKEDIN' : params.channel

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: params.leadId },
      select: { status: true },
    })
    const event = await tx.contactEvent.create({
      data: {
        leadId: params.leadId,
        userId: params.userId,
        channel,
        outcome: params.outcome,
        note: params.note,
        dispatchId: params.dispatchId,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: now,
      },
      select: { id: true },
    })

    let transitioned = false
    if (lead) {
      const current = asStatus(lead.status)
      const target = outcomeTargetStatus(params.outcome, current)
      if (target) {
        transitioned = await guardedLeadTransition(tx, params.leadId, current, target, now)
      }
      const mapping = NEXT_ACTION_BY_OUTCOME[params.outcome]
      if (mapping) {
        // nextAction sugerida fica consultavel (painel Fila de Leads, task 29).
        const fresh = await tx.lead.findUnique({
          where: { id: params.leadId },
          select: { metadata: true },
        })
        const base =
          fresh?.metadata && typeof fresh.metadata === 'object' && !Array.isArray(fresh.metadata)
            ? (fresh.metadata as Record<string, unknown>)
            : {}
        await tx.lead.update({
          where: { id: params.leadId },
          data: {
            metadata: {
              ...base,
              nextAction: mapping.nextAction,
              nextActionLabel: mapping.label,
              nextActionAt: now.toISOString(),
              nextActionOutcome: params.outcome,
            } as unknown as Prisma.InputJsonValue,
          },
        })
      }
    }
    return { contactEventId: event.id, transitioned }
  })
}
