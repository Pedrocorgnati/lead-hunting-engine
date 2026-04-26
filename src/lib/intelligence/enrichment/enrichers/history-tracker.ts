/**
 * History tracker — TASK-5 intake-review (CL-066, CL-079)
 *
 * Faz diff entre estado antigo e novo de um Lead e registra mudancas
 * em `lead_history`. Usado pelos services/endpoints que atualizam Lead.
 *
 * Nunca lanca: captura erros e retorna array de campos registrados.
 */

import { prisma } from '@/lib/prisma'

/** Campos relevantes para tracking (ignora timestamps e IDs). */
const TRACKED_FIELDS = [
  'website',
  'techStack',
  'siteAudit',
  'googleReviews',
  'serpRank',
  'adsStatus',
  'rating',
  'reviewCount',
  'instagramHandle',
  'instagramFollowers',
  'facebookPageId',
  'facebookFollowers',
  'businessName',
  'phone',
  'status',
  'score',
  'temperature',
] as const

type TrackedField = (typeof TRACKED_FIELDS)[number]

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  try {
    return JSON.stringify(value, Object.keys(value as object).sort())
  } catch {
    return String(value)
  }
}

function isChanged(oldVal: unknown, newVal: unknown): boolean {
  // Arrays / objetos: comparar por JSON estavel
  if (typeof oldVal === 'object' || typeof newVal === 'object') {
    return stableJson(oldVal) !== stableJson(newVal)
  }
  return oldVal !== newVal
}

export interface HistoryEntryDraft {
  field: string
  oldValue: unknown
  newValue: unknown
}

/**
 * Compara `before` x `after` e retorna entradas para persistir.
 * Nao escreve no banco — apenas calcula diff.
 */
export function diffLead(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): HistoryEntryDraft[] {
  const drafts: HistoryEntryDraft[] = []
  if (!before) return drafts
  for (const field of TRACKED_FIELDS as readonly TrackedField[]) {
    if (!(field in after)) continue
    const oldVal = before[field]
    const newVal = after[field]
    if (isChanged(oldVal, newVal)) {
      drafts.push({ field, oldValue: oldVal ?? null, newValue: newVal ?? null })
    }
  }
  return drafts
}

/**
 * Persiste entradas de historico para um lead.
 * `createMany` garante insert em lote; falhas nao quebram o fluxo.
 */
export async function recordHistory(
  leadId: string,
  drafts: HistoryEntryDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0
  try {
    const res = await prisma.leadHistory.createMany({
      data: drafts.map((d) => ({
        leadId,
        field: d.field,
        oldValue: d.oldValue as never,
        newValue: d.newValue as never,
      })),
    })
    return res.count
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[history-tracker] failed to persist:', err instanceof Error ? err.message : err)
    return 0
  }
}

/**
 * Conveniencia: diff + persist em um unico passo.
 * Retorna o numero de registros inseridos.
 */
export async function trackLeadChanges(
  leadId: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): Promise<number> {
  const drafts = diffLead(before, after)
  return recordHistory(leadId, drafts)
}

export interface LeadHistoryEntry {
  id: string
  field: string
  oldValue: unknown
  newValue: unknown
  changedAt: string
}

/**
 * Retorna historico de mudancas dos ultimos `days` dias.
 */
export async function getHistory(
  leadId: string,
  days = 30,
): Promise<LeadHistoryEntry[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000)
    const rows = await prisma.leadHistory.findMany({
      where: { leadId, changedAt: { gte: since } },
      orderBy: { changedAt: 'desc' },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedAt: r.changedAt.toISOString(),
    }))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[history-tracker] getHistory failed:', err instanceof Error ? err.message : err)
    return []
  }
}
