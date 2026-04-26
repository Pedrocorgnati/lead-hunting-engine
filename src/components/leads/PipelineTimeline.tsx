'use client'

/**
 * TASK-16/ST002 (CL-488): timeline do pipeline com custos.
 * Consome GET /api/v1/leads/[id]/pipeline-logs.
 */
import { useEffect, useState } from 'react'
import { Activity, AlertCircle, BrainCircuit, Cloud, Edit3, Loader2 } from 'lucide-react'

interface PipelineEvent {
  kind: 'history.field_changed' | 'api.call' | 'llm.call'
  at: string
  meta: Record<string, unknown>
  costUsd?: number
}

interface Payload {
  events: PipelineEvent[]
  totalCostUsd: number
  days: number
}

function icon(kind: PipelineEvent['kind']) {
  if (kind === 'llm.call') return <BrainCircuit className="h-3 w-3" aria-hidden="true" />
  if (kind === 'api.call') return <Cloud className="h-3 w-3" aria-hidden="true" />
  return <Edit3 className="h-3 w-3" aria-hidden="true" />
}

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

function describe(ev: PipelineEvent): string {
  if (ev.kind === 'history.field_changed') {
    const { field } = ev.meta as { field?: string }
    return `Alteração em ${field ?? 'campo'}`
  }
  if (ev.kind === 'llm.call') {
    const { provider, model, operation } = ev.meta as { provider?: string; model?: string; operation?: string }
    return `LLM ${provider ?? ''} ${model ?? ''} ${operation ? `· ${operation}` : ''}`.trim()
  }
  const { provider, operation } = ev.meta as { provider?: string; operation?: string }
  return `API ${provider ?? ''}${operation ? ` · ${operation}` : ''}`.trim()
}

export function PipelineTimeline({ leadId }: { leadId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/pipeline-logs`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as { data: Payload }
        if (!cancelled) setData(json.data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar pipeline')
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
    <section
      data-testid="pipeline-timeline"
      aria-labelledby="pipeline-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="pipeline-title" className="text-sm font-semibold">Pipeline</h2>
        </div>
        {data ? (
          <p className="text-xs text-muted-foreground">
            {data.events.length} eventos · custo total{' '}
            <span className="font-mono tabular-nums">
              {data.totalCostUsd.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}
            </span>
          </p>
        ) : null}
      </header>

      <div className="mt-4">
        {!data && !error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        ) : data && data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento nos últimos {data.days} dias.</p>
        ) : (
          <ol className="space-y-2">
            {data?.events.slice(0, 50).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                    e.kind === 'llm.call'
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      : e.kind === 'api.call'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {icon(e.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{describe(e)}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={e.at}>{fmtDate(e.at)}</time>
                    {e.costUsd != null ? (
                      <>
                        {' · '}
                        <span className="font-mono tabular-nums">
                          {e.costUsd.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
