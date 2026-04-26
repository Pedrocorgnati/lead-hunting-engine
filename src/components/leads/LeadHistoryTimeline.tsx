'use client'

/**
 * TASK-25/ST001 (CL-489): timeline de alteracoes do lead.
 * Consome GET /api/v1/leads/[id]/history (existente, TASK-5).
 * Renderiza diff legivel: timestamp | field | before -> after.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock, History, Loader2 } from 'lucide-react'

interface LeadHistoryEntry {
  id: string
  field: string
  oldValue: unknown
  newValue: unknown
  changedAt: string
}

interface LeadHistoryTimelineProps {
  leadId: string
  days?: number
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: LeadHistoryEntry[] }

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  score: 'Score',
  temperature: 'Temperatura',
  notes: 'Notas',
  website: 'Site',
  phone: 'Telefone',
  businessName: 'Nome do negócio',
  rating: 'Avaliação',
  reviewCount: 'Qtd. avaliações',
  googleReviews: 'Google Reviews',
  serpRank: 'Ranking SERP',
  adsStatus: 'Status Ads',
  techStack: 'Stack técnica',
  siteAudit: 'Auditoria do site',
  instagramHandle: 'Instagram',
  instagramFollowers: 'Seguidores IG',
  facebookPageId: 'Facebook',
  facebookFollowers: 'Seguidores FB',
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function LeadHistoryTimeline({ leadId, days = 30 }: LeadHistoryTimelineProps) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/history?days=${days}`, {
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json: { data: { history: LeadHistoryEntry[] } }) => {
        if (cancelled) return
        setState({ kind: 'ready', entries: json.data.history ?? [] })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Erro ao carregar histórico',
        })
      })
    return () => {
      cancelled = true
    }
  }, [leadId, days])

  const fields = useMemo(() => {
    if (state.kind !== 'ready') return [] as string[]
    return Array.from(new Set(state.entries.map((e) => e.field))).sort()
  }, [state])

  const visibleEntries = useMemo(() => {
    if (state.kind !== 'ready') return []
    return filter ? state.entries.filter((e) => e.field === filter) : state.entries
  }, [state, filter])

  return (
    <section
      data-testid="lead-history-timeline"
      aria-labelledby="lead-history-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="lead-history-title" className="text-sm font-semibold">
            Histórico de alterações
          </h2>
        </div>
        {state.kind === 'ready' && fields.length > 0 ? (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            aria-label="Filtrar por tipo de alteração"
          >
            <option value="">Todos os campos</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f] ?? f}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      <div className="mt-4">
        {state.kind === 'loading' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando histórico…
          </div>
        ) : state.kind === 'error' ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {state.message}
          </div>
        ) : visibleEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma alteração registrada {filter ? 'para este filtro' : `nos últimos ${days} dias`}.
          </p>
        ) : (
          <ol className="relative ml-3 space-y-4 border-l border-border pl-5">
            {visibleEntries.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary"
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <time dateTime={entry.changedAt}>{fmtDate(entry.changedAt)}</time>
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-medium">
                    {FIELD_LABELS[entry.field] ?? entry.field}
                  </span>
                  <span className="text-muted-foreground">: </span>
                  <span className="rounded bg-destructive/10 px-1 text-destructive line-through">
                    {fmtValue(entry.oldValue)}
                  </span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="rounded bg-[--color-success]/10 px-1 text-[--color-success]">
                    {fmtValue(entry.newValue)}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
