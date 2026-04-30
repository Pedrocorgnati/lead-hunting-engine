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
