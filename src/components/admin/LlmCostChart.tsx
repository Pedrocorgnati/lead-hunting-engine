'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface SeriesPoint {
  bucket: string
  totalUsd: string
  calls: number
}

interface LlmCostResponse {
  totals: {
    totalUsd: string
    totalCalls: number
    inputTokens: number
    outputTokens: number
  }
  byProviderModel: Array<{
    provider: string
    model: string
    totalUsd: string
    calls: number
  }>
  series: SeriesPoint[]
}

/**
 * Visualizacao simples de custo LLM (tabela + sparkline SVG, sem depender de
 * libs de grafico externas). Cobre TASK-10 sem adicionar `recharts` ao bundle.
 */
export function LlmCostChart() {
  const [data, setData] = useState<LlmCostResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/v1/admin/metrics/llm-cost')
        if (!res.ok) throw new Error()
        const json = (await res.json()) as { data: LlmCostResponse }
        if (active) setData(json.data)
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <Skeleton className="h-40 w-full" />
  if (error || !data) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Nao foi possivel carregar custo LLM.
      </div>
    )
  }

  const max = Math.max(...data.series.map((p) => Number(p.totalUsd)), 0)
  const points = data.series
    .map((p, idx) => {
      const x = (idx / Math.max(1, data.series.length - 1)) * 100
      const y = max === 0 ? 50 : 50 - (Number(p.totalUsd) / max) * 45
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Custo total (USD)</div>
          <div className="text-2xl font-semibold">
            ${Number(data.totals.totalUsd).toFixed(4)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Chamadas</div>
          <div className="text-2xl font-semibold">{data.totals.totalCalls}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tokens in/out</div>
          <div className="text-2xl font-semibold">
            {data.totals.inputTokens.toLocaleString('pt-BR')} /{' '}
            {data.totals.outputTokens.toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      {data.series.length > 0 && (
        <svg
          viewBox="0 0 100 55"
          className="h-28 w-full"
          preserveAspectRatio="none"
          aria-label="Custo LLM nos ultimos 30 dias"
          role="img"
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.8}
            className="text-primary"
          />
        </svg>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Provider / Modelo</th>
              <th className="py-2 text-right">Chamadas</th>
              <th className="py-2 text-right">Custo (USD)</th>
            </tr>
          </thead>
          <tbody>
            {data.byProviderModel.map((row) => (
              <tr key={`${row.provider}:${row.model}`} className="border-t">
                <td className="py-2 font-mono text-xs">
                  {row.provider} / {row.model ?? '—'}
                </td>
                <td className="py-2 text-right">{row.calls}</td>
                <td className="py-2 text-right">
                  ${Number(row.totalUsd).toFixed(4)}
                </td>
              </tr>
            ))}
            {data.byProviderModel.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="py-4 text-center text-muted-foreground"
                >
                  Sem chamadas LLM no periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
