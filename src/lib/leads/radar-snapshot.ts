import { prisma } from '@/lib/prisma'
import type { Lead, LeadStatus, LeadTemperature, OpportunityType, Prisma } from '@prisma/client'

/**
 * Snapshots de radar do lead (Task 35 / B10).
 *
 * Armazenamento: linhas de AuditLog com action 'lead.snapshot.captured' |
 * 'lead.snapshot.restored' e metadata { correlationId, score, values, fields,
 * changeCount, restoredFrom? }:
 *   - `values`  = estado completo dos campos rastreados (fonte do restore)
 *   - `fields`  = diff vs snapshot anterior ({campo: {prev, next}}, UI da tab)
 *
 * Linhas legadas 'lead.snapshot.triggered' (sem values) continuam aparecendo
 * na listagem mas nao sao restauraveis (SNAPSHOT_NOT_RESTORABLE).
 */
export const TRACKED_FIELDS = [
  'score',
  'temperature',
  'status',
  'website',
  'phone',
  'rating',
  'reviewCount',
  'instagramFollowers',
  'facebookFollowers',
  'opportunities',
  'problems',
  'suggestions',
] as const

export type SnapshotValues = {
  score: number
  temperature: string
  status: string
  website: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  instagramFollowers: number | null
  facebookFollowers: number | null
  opportunities: string[]
  problems: string[]
  suggestions: string[]
}

export type SnapshotDiff = Record<string, { prev: unknown; next: unknown }>

export interface SnapshotView {
  id: string
  createdAt: string
  score: number
  changeCount: number
  fields: SnapshotDiff
}

export function extractSnapshotValues(lead: Lead): SnapshotValues {
  return {
    score: lead.score,
    temperature: lead.temperature,
    status: lead.status,
    website: lead.website,
    phone: lead.phone,
    rating: lead.rating === null || lead.rating === undefined ? null : Number(lead.rating),
    reviewCount: lead.reviewCount ?? null,
    instagramFollowers: lead.instagramFollowers ?? null,
    facebookFollowers: lead.facebookFollowers ?? null,
    opportunities: [...lead.opportunities],
    problems: [...lead.problems],
    suggestions: [...lead.suggestions],
  }
}

export function diffValues(prev: SnapshotValues | null, next: SnapshotValues): SnapshotDiff {
  if (!prev) return {}
  const diff: SnapshotDiff = {}
  for (const field of TRACKED_FIELDS) {
    const a = prev[field]
    const b = next[field]
    const equal = Array.isArray(a) || Array.isArray(b)
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b
    if (!equal) diff[field] = { prev: a, next: b }
  }
  return diff
}

interface SnapshotRow {
  id: string
  createdAt: Date
  metadata: Prisma.JsonValue
}

function rowValues(row: SnapshotRow): SnapshotValues | null {
  const meta = row.metadata as { values?: SnapshotValues } | null
  return meta?.values ?? null
}

export function toSnapshotView(row: SnapshotRow): SnapshotView {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    score: typeof meta.score === 'number' ? meta.score : 0,
    changeCount: typeof meta.changeCount === 'number' ? meta.changeCount : 0,
    fields: (meta.fields as SnapshotDiff | undefined) ?? {},
  }
}

async function findSnapshots(leadId: string, take = 50): Promise<SnapshotRow[]> {
  return prisma.auditLog.findMany({
    where: { resource: 'lead', resourceId: leadId, action: { contains: 'snapshot' } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, createdAt: true, metadata: true },
  })
}

async function latestValues(leadId: string): Promise<SnapshotValues | null> {
  const rows = await findSnapshots(leadId, 10)
  for (const row of rows) {
    const values = rowValues(row)
    if (values) return values
  }
  return null
}

/** Captura um snapshot real do lead (action: captured|restored). */
export async function captureLeadSnapshot(
  userId: string,
  lead: Lead,
  opts: { action?: 'captured' | 'restored'; restoredFrom?: string } = {},
): Promise<SnapshotView> {
  const values = extractSnapshotValues(lead)
  const previous = await latestValues(lead.id)
  const fields = diffValues(previous, values)
  const correlationId = crypto.randomUUID()

  const row = await prisma.auditLog.create({
    data: {
      userId,
      action: `lead.snapshot.${opts.action ?? 'captured'}`,
      resource: 'lead',
      resourceId: lead.id,
      metadata: {
        correlationId,
        score: values.score,
        values,
        fields,
        changeCount: Object.keys(fields).length,
        ...(opts.restoredFrom ? { restoredFrom: opts.restoredFrom } : {}),
      } as Prisma.InputJsonValue,
    },
    select: { id: true, createdAt: true, metadata: true },
  })
  return toSnapshotView(row)
}

export class SnapshotNotRestorableError extends Error {
  code = 'SNAPSHOT_NOT_RESTORABLE'
  httpStatus = 422
  constructor() {
    super('Snapshot sem dados restauraveis (captura legada anterior ao radar real).')
  }
}

/**
 * Reverte o lead para os valores de um snapshot e registra a reversao como
 * novo snapshot (diff natural vs estado pre-restore). Retorna o snapshot
 * pos-restore ou null se o snapshot alvo nao existe para esse lead.
 */
export async function restoreLeadSnapshot(
  userId: string,
  leadId: string,
  snapshotId: string,
): Promise<SnapshotView | null> {
  const target = await prisma.auditLog.findFirst({
    where: { id: snapshotId, resource: 'lead', resourceId: leadId, action: { contains: 'snapshot' } },
    select: { id: true, createdAt: true, metadata: true },
  })
  if (!target) return null

  const values = rowValues(target)
  if (!values) throw new SnapshotNotRestorableError()

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      score: values.score,
      temperature: values.temperature as LeadTemperature,
      status: values.status as LeadStatus,
      website: values.website,
      phone: values.phone,
      rating: values.rating,
      reviewCount: values.reviewCount,
      instagramFollowers: values.instagramFollowers,
      facebookFollowers: values.facebookFollowers,
      opportunities: values.opportunities as OpportunityType[],
      problems: values.problems,
      suggestions: values.suggestions,
    },
  })

  const restored = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
  return captureLeadSnapshot(userId, restored, { action: 'restored', restoredFrom: snapshotId })
}

export interface SnapshotDiffResult {
  leadId: string
  from: { id: string; createdAt: string } | null
  to: { id: string; createdAt: string } | null
  diff: SnapshotDiff
  reason?: string
}

/**
 * Diff entre dois snapshots (default: os dois mais recentes com values).
 * `fromId`/`toId` opcionais selecionam snapshots especificos.
 */
export async function diffLeadSnapshots(
  leadId: string,
  fromId?: string | null,
  toId?: string | null,
): Promise<SnapshotDiffResult> {
  const rows = await findSnapshots(leadId)
  const withValues = rows.filter((r) => rowValues(r) !== null)

  const pick = (id: string | null | undefined, fallbackIdx: number): SnapshotRow | null => {
    if (id) return withValues.find((r) => r.id === id) ?? null
    return withValues[fallbackIdx] ?? null
  }

  const to = pick(toId, 0)
  const from = pick(fromId, 1)

  if (!to || !from) {
    return {
      leadId,
      from: from ? { id: from.id, createdAt: from.createdAt.toISOString() } : null,
      to: to ? { id: to.id, createdAt: to.createdAt.toISOString() } : null,
      diff: {},
      reason: 'Sao necessarios ao menos dois snapshots com dados para comparar.',
    }
  }

  return {
    leadId,
    from: { id: from.id, createdAt: from.createdAt.toISOString() },
    to: { id: to.id, createdAt: to.createdAt.toISOString() },
    diff: diffValues(rowValues(from), rowValues(to)!),
  }
}

/** CSV do diff (campo;de;para) para o export da tela de radar. */
export function diffToCsv(result: SnapshotDiffResult): string {
  const header = 'campo;de;para'
  const lines = Object.entries(result.diff).map(([field, { prev, next }]) => {
    const fmt = (v: unknown) => {
      const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(',') : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    return `${field};${fmt(prev)};${fmt(next)}`
  })
  return [header, ...lines].join('\n')
}
