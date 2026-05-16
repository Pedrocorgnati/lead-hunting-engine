'use client'

import { useEffect, useState } from 'react'
import { Clock, GitBranch, MessageSquare, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { mergeTimeline, type TimelineEntry, type LeadHistory, type ContactEvent } from '@/lib/leads/merge-timeline'

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function KindIcon({ kind }: { kind: TimelineEntry['kind'] }) {
  if (kind === 'contact')
    return <MessageSquare className="h-3 w-3 text-green-500" aria-hidden="true" />
  if (kind === 'system')
    return <GitBranch className="h-3 w-3 text-gray-400" aria-hidden="true" />
  return <Clock className="h-3 w-3 text-blue-500" aria-hidden="true" />
}

function kindLabel(kind: TimelineEntry['kind']): string {
  if (kind === 'contact') return 'Contato'
  if (kind === 'system') return 'Sistema'
  return 'Histórico'
}

function kindColor(kind: TimelineEntry['kind']): string {
  if (kind === 'contact') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  if (kind === 'system') return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
}

export function PipelineTimeline({ leadId }: { leadId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [histRes, evtRes] = await Promise.all([
        fetch(`/api/v1/leads/${leadId}/history`),
        fetch(`/api/v1/leads/${leadId}/contact-events`),
      ])
      const histData: { items: LeadHistory[] } = histRes.ok ? await histRes.json() : { items: [] }
      const evtData: { items: ContactEvent[] } = evtRes.ok ? await evtRes.json() : { items: [] }
      setEntries(mergeTimeline(histData.items ?? [], evtData.items ?? []))
    } catch {
      setError('Erro ao carregar atividade do lead.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando atividade...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <span role="alert">{error}</span>
        <button
          onClick={load}
          className="flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground"
          aria-label="Tentar novamente"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-6" role="status">
        Sem atividade ainda.
      </p>
    )
  }

  return (
    <ol role="list" className="space-y-3" aria-label="Linha do tempo do lead">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 items-start">
          <span
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${kindColor(entry.kind)}`}
            aria-label={kindLabel(entry.kind)}
          >
            <KindIcon kind={entry.kind} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{entry.summary}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(entry.occurredAt)}
              {entry.actor && ` · ${entry.actor}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
