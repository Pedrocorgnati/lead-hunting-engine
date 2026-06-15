import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 21 — F-21): SLA por campanha/nicho
 * e prioridade dinamica. Recalcula a prioridade dos dispatches SCHEDULED com
 * base em recencia, resposta parcial e sinais de engajamento; garante que
 * leads quentes tenham janela de acao (SLA) definida.
 *
 * A prioridade vive em OutreachDispatch.priority (consumida pelo scheduler,
 * orderBy priority desc). A funcao de calculo e PURA; o runner persiste.
 */
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'

export interface PriorityInput {
  baseScore: number
  scheduledAt: Date
  hasPartialReply: boolean
  slaHours: number
  now: Date
}

/**
 * Prioridade dinamica: base (score do lead) + boost por resposta parcial +
 * boost por proximidade/violacao de SLA. Quanto mais perto/alem do SLA, mais
 * urgente (lead quente nao pode ficar sem janela de acao — Aceite task 21).
 */
export function computePriority(input: PriorityInput): number {
  let priority = input.baseScore
  if (input.hasPartialReply) priority += 50 // reabriu engajamento: topo da fila
  const ageHours = (input.now.getTime() - input.scheduledAt.getTime()) / 3600_000
  const slaProgress = input.slaHours > 0 ? ageHours / input.slaHours : 0
  if (slaProgress >= 1) priority += 40 // SLA estourado
  else if (slaProgress >= 0.75) priority += 20 // perto do limite
  return Math.round(priority)
}

export interface SlaReprioritizeResult {
  reprioritized: number
  slaBreaches: number
}

export async function reprioritizeDispatches(now: Date = new Date()): Promise<SlaReprioritizeResult> {
  const defaultSla = await getConfig<{ defaultHours?: number }>('outreach.sla')
  const fallbackSlaHours = Number(defaultSla.defaultHours ?? 24)

  const scheduled = await prisma.outreachDispatch.findMany({
    where: { status: 'SCHEDULED', campaign: { status: 'ACTIVE' } },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      priority: true,
      campaign: { select: { slaHours: true } },
    },
    take: 500,
  })

  let reprioritized = 0
  let slaBreaches = 0
  for (const d of scheduled) {
    // Resposta parcial: ha ContactEvent de engajamento (ANSWERED/FORWARDED/
    // OUT_OF_OFFICE) sem fechamento? Sinaliza follow-up prioritario.
    const partial = await prisma.contactEvent.findFirst({
      where: { leadId: d.leadId, outcome: { in: ['ANSWERED', 'FORWARDED', 'OUT_OF_OFFICE'] } },
      select: { id: true },
    })
    const slaHours = d.campaign.slaHours ?? fallbackSlaHours
    const next = computePriority({
      baseScore: d.priority,
      scheduledAt: d.scheduledAt,
      hasPartialReply: Boolean(partial),
      slaHours,
      now,
    })
    const ageHours = (now.getTime() - d.scheduledAt.getTime()) / 3600_000
    if (ageHours >= slaHours) slaBreaches += 1
    if (next !== d.priority) {
      await prisma.outreachDispatch.update({ where: { id: d.id }, data: { priority: next } })
      reprioritized += 1
    }
  }
  return { reprioritized, slaBreaches }
}
