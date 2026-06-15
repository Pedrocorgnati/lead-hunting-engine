/**
 * Lead lifecycle state machine — M12-B5 (Codex caught: PATCH atualizava status sem
 * validar transicao, sem registrar historico, com retencao divergente entre rotas).
 *
 * Origem: BUDGET.md Milestone 12 promete "gestao completa do ciclo de vida, do lead
 * novo ate convertido ou descartado". Sem invariantes, o promotor pode pular
 * estagios (ex: NEW -> CONVERTED sem CONTACTED), tornando metricas comerciais
 * (taxa de conversao, conversionRate em getDashboardStats) inconsistentes.
 *
 * Transicoes validas:
 *   NEW            -> CONTACTED, NEGOTIATING, DISCARDED, DISQUALIFIED, FALSE_POSITIVE, ENRICHMENT_PENDING
 *   ENRICHMENT_PENDING -> NEW, FALSE_POSITIVE, DISQUALIFIED
 *   CONTACTED      -> NEGOTIATING, CONVERTED, DISCARDED, DISQUALIFIED
 *   NEGOTIATING    -> CONVERTED, DISCARDED, DISQUALIFIED, CONTACTED (rollback)
 *   CONVERTED      -> [] (terminal)
 *   DISCARDED      -> [] (terminal)
 *   FALSE_POSITIVE -> [] (terminal)
 *   DISQUALIFIED   -> NEW (re-qualificacao apos enriquecimento)
 *
 * Retencao (alinhamento das rotas /api/v1/leads/[id] e [id]/status):
 *   - Estados terminais (CONVERTED, DISCARDED, FALSE_POSITIVE) e DISQUALIFIED
 *     disparam janela de retencao para descarte seguro (LGPD/auditoria).
 *   - Estados ativos (NEW, CONTACTED, NEGOTIATING, ENRICHMENT_PENDING) limpam
 *     retencao (lead volta ao funil).
 */

import type { Lead } from '@prisma/client'

export type LeadStatusValue =
  | 'NEW'
  | 'CONTACTED'
  | 'NEGOTIATING'
  | 'CONVERTED'
  | 'DISCARDED'
  | 'DISQUALIFIED'
  | 'FALSE_POSITIVE'
  | 'ENRICHMENT_PENDING'

export const VALID_TRANSITIONS: Record<LeadStatusValue, ReadonlyArray<LeadStatusValue>> = {
  NEW: ['CONTACTED', 'NEGOTIATING', 'DISCARDED', 'DISQUALIFIED', 'FALSE_POSITIVE', 'ENRICHMENT_PENDING'],
  ENRICHMENT_PENDING: ['NEW', 'FALSE_POSITIVE', 'DISQUALIFIED'],
  CONTACTED: ['NEGOTIATING', 'CONVERTED', 'DISCARDED', 'DISQUALIFIED'],
  NEGOTIATING: ['CONVERTED', 'DISCARDED', 'DISQUALIFIED', 'CONTACTED'],
  CONVERTED: [],
  DISCARDED: [],
  FALSE_POSITIVE: [],
  DISQUALIFIED: ['NEW'],
}

export const TERMINAL_STATES: ReadonlyArray<LeadStatusValue> = [
  'CONVERTED',
  'DISCARDED',
  'FALSE_POSITIVE',
]

export const RETENTION_DAYS = 15

/** Retorna true se a transicao from -> to e valida no state machine. */
export function isValidTransition(from: LeadStatusValue, to: LeadStatusValue): boolean {
  // No-op (mesmo estado) e considerado valido — operacao idempotente.
  if (from === to) return true
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function isTerminal(status: LeadStatusValue): boolean {
  return TERMINAL_STATES.includes(status)
}

/**
 * Calcula campos canonicos de retencao/contato para uma transicao.
 * Usado por updateStatus (lead.service.ts) e PATCH /leads/[id] para garantir
 * consistencia entre os dois endpoints.
 */
export function computeStatusSideEffects(
  newStatus: LeadStatusValue,
  now: Date = new Date()
): { contactedAt?: Date; retentionUntil: Date | null } {
  const sideEffects: { contactedAt?: Date; retentionUntil: Date | null } = {
    retentionUntil: null,
  }
  if (newStatus === 'CONTACTED') {
    sideEffects.contactedAt = now
  }
  // Estados terminais e DISQUALIFIED disparam retencao
  if (
    newStatus === 'CONVERTED' ||
    newStatus === 'DISCARDED' ||
    newStatus === 'FALSE_POSITIVE' ||
    newStatus === 'DISQUALIFIED'
  ) {
    sideEffects.retentionUntil = new Date(now.getTime() + RETENTION_DAYS * 86_400_000)
  }
  return sideEffects
}

export class InvalidTransitionError extends Error {
  code = 'LEAD_INVALID_TRANSITION'
  httpStatus = 409
  constructor(from: LeadStatusValue, to: LeadStatusValue) {
    super(`Transicao invalida: ${from} -> ${to}. Estados terminais nao permitem reentrada.`)
    this.name = 'InvalidTransitionError'
  }
}

/** Helper para casts em codigo legado que recebe Lead['status']. */
export function asStatus(s: Lead['status']): LeadStatusValue {
  return s as LeadStatusValue
}

// ─── outreach-engine (brainstorm 06-10) ────────────────────────────────────

/**
 * Task 22 (F-23): loop de feedback comercial — mapeia outcome de
 * ContactEvent para o proximo passo executavel. `targetStatus` null = sem
 * transicao automatica (decisao humana); `nextAction` e sempre sugerida
 * (Zero Estados Indefinidos: todo outcome tem proximo passo).
 *
 * Inclui os outcomes novos do outreach (SENT/BOUNCED/OPT_OUT/FORWARDED/
 * OUT_OF_OFFICE/AMBIGUOUS) e os legados manuais.
 */
export type ContactOutcomeValue =
  | 'NO_ANSWER'
  | 'ANSWERED'
  | 'INTERESTED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'SENT'
  | 'BOUNCED'
  | 'OPT_OUT'
  | 'FORWARDED'
  | 'OUT_OF_OFFICE'
  | 'AMBIGUOUS'

export type NextLeadAction =
  | 'follow_up'
  | 'human_review'
  | 'schedule_meeting'
  | 'close_lost'
  | 'close_won_path'
  | 'enrich_again'
  | 'none'

export const NEXT_ACTION_BY_OUTCOME: Record<
  ContactOutcomeValue,
  { targetStatus: LeadStatusValue | null; nextAction: NextLeadAction; label: string }
> = {
  SENT: { targetStatus: 'CONTACTED', nextAction: 'follow_up', label: 'Aguardar resposta / follow-up agendado' },
  NO_ANSWER: { targetStatus: null, nextAction: 'follow_up', label: 'Sem resposta — follow-up' },
  ANSWERED: { targetStatus: null, nextAction: 'human_review', label: 'Respondeu — revisar e responder' },
  INTERESTED: { targetStatus: 'NEGOTIATING', nextAction: 'schedule_meeting', label: 'Interessado — agendar conversa' },
  SCHEDULED: { targetStatus: 'NEGOTIATING', nextAction: 'close_won_path', label: 'Reuniao marcada — conduzir negociacao' },
  REJECTED: { targetStatus: 'DISCARDED', nextAction: 'close_lost', label: 'Recusou — encerrar campanha' },
  OPT_OUT: { targetStatus: 'DISCARDED', nextAction: 'close_lost', label: 'Opt-out — suprimir e encerrar' },
  BOUNCED: { targetStatus: null, nextAction: 'enrich_again', label: 'Bounce — re-enriquecer contato' },
  FORWARDED: { targetStatus: null, nextAction: 'human_review', label: 'Encaminhado — revisar novo contato' },
  OUT_OF_OFFICE: { targetStatus: null, nextAction: 'follow_up', label: 'Fora do escritorio — reagendar follow-up' },
  AMBIGUOUS: { targetStatus: null, nextAction: 'human_review', label: 'Resposta ambigua — revisao humana' },
}

/**
 * Transicao automatica sugerida por outcome, respeitando o state machine.
 * Retorna null quando nao ha transicao automatica valida a partir do estado
 * atual (ex.: outcome INTERESTED com lead ja CONVERTED).
 */
export function outcomeTargetStatus(
  outcome: ContactOutcomeValue,
  current: LeadStatusValue,
): LeadStatusValue | null {
  const target = NEXT_ACTION_BY_OUTCOME[outcome]?.targetStatus ?? null
  if (!target || target === current) return null
  return isValidTransition(current, target) ? target : null
}
