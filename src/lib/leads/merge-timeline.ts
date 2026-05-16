export type TimelineKind = 'history' | 'contact' | 'system'

export interface TimelineEntry {
  id: string
  kind: TimelineKind
  occurredAt: string
  actor?: string
  summary: string
  payload?: Record<string, unknown>
}

export interface LeadHistory {
  id: string
  field?: string
  oldValue?: unknown
  newValue?: unknown
  changedBy?: string
  occurredAt: string
  extra?: Record<string, unknown>
}

export interface ContactEvent {
  id: string
  type?: string
  channel?: string
  contactedBy?: string
  occurredAt: string
  notes?: string
  extra?: Record<string, unknown>
}

function fromHistory(h: LeadHistory): TimelineEntry {
  return {
    id: `hist-${h.id}`,
    kind: 'history',
    occurredAt: h.occurredAt,
    actor: h.changedBy,
    summary: h.field ? `Alteração em ${h.field}` : 'Atualização registrada',
    payload: h.extra,
  }
}

function fromContact(e: ContactEvent): TimelineEntry {
  return {
    id: `contact-${e.id}`,
    kind: 'contact',
    occurredAt: e.occurredAt,
    actor: e.contactedBy,
    summary: [e.channel, e.type].filter(Boolean).join(' · ') || 'Contato registrado',
    payload: e.extra,
  }
}

/** Merge LeadHistory + ContactEvent arrays, sorted by occurredAt desc. */
export function mergeTimeline(
  history: LeadHistory[],
  events: ContactEvent[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...history.map(fromHistory),
    ...events.map(fromContact),
  ]
  return entries.sort((a, b) => {
    const diff = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    if (diff !== 0) return diff
    return b.id.localeCompare(a.id)
  })
}
