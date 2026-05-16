'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Info } from 'lucide-react'
import type { ScoreBreakdownResponse, ScoreRule } from '@/app/api/v1/leads/[id]/score-breakdown/route'

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function RuleRow({ rule }: { rule: ScoreRule }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm font-medium" title={rule.name}>
        {rule.name}
      </span>
      <ScoreBar value={rule.contribution} max={rule.weight} />
      <span className="w-14 text-right text-xs text-muted-foreground shrink-0">
        {rule.contribution}/{rule.weight}
      </span>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Detalhes: ${rule.name}`}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute mt-8 z-10 max-w-xs rounded border bg-popover p-2 text-xs shadow-md"
        >
          {rule.reason}
        </div>
      )}
    </li>
  )
}

export function LeadScoreBreakdown({ leadId }: { leadId: string }) {
  const [data, setData] = useState<ScoreBreakdownResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/score-breakdown`)
      if (!res.ok) throw new Error('Erro ao carregar breakdown')
      setData(await res.json())
    } catch {
      setError('Erro ao carregar breakdown de score.')
    } finally {
      setLoading(false)
    }
  }

  async function recalculate() {
    setRecalculating(true)
    try {
      await fetch(`/api/v1/leads/${leadId}/recompute-score`, { method: 'POST' })
      await load()
    } finally {
      setRecalculating(false)
    }
  }

  useEffect(() => { load() }, [leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando score...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-sm text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <span role="alert">{error}</span>
        <button onClick={load} className="flex items-center gap-1 text-xs underline text-muted-foreground">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data || data.rules.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma regra de scoring disponível.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Score total: {data.totalScore}</span>
        <button
          onClick={recalculate}
          disabled={recalculating}
          className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          aria-label="Recalcular score"
        >
          {recalculating ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          )}
          Recalcular
        </button>
      </div>
      <ul role="list" className="relative space-y-3" aria-label="Breakdown de scoring">
        {data.rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </ul>
    </div>
  )
}
