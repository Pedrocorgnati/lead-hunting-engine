'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * MetricsComparePanel — mostra current vs previous para jobs/leads/LLM cost.
 *
 * Origem: TASK-13 intake-review / ST004 (CL-113).
 */
interface CompareResponse {
  period: '7d' | '30d'
  current: { jobs: number; leads: number; llmCostUsd: string }
  previous: { jobs: number; leads: number; llmCostUsd: string }
  delta: { jobs: number; leads: number; llmCostUsd: number }
}

function fmtDelta(n: number): { label: string; tone: 'up' | 'down' | 'flat' } {
  if (!Number.isFinite(n) || n === 0) return { label: '0%', tone: 'flat' }
  return {
    label: `${n > 0 ? '+' : ''}${n.toFixed(1)}%`,
    tone: n > 0 ? 'up' : 'down',
  }
}

const toneClass: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
}

export function MetricsComparePanel() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/admin/metrics/compare?period=${period}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: CompareResponse }
        if (!cancelled) setData(json.data)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [period])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Comparacao de periodos</CardTitle>
        <div className="flex gap-2" role="tablist" aria-label="Selecionar periodo">
          <Button
            type="button"
            variant={period === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('7d')}
          >
            Semana
          </Button>
          <Button
            type="button"
            variant={period === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('30d')}
          >
            30 dias
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-destructive" role="alert">
            Nao foi possivel carregar: {error}
          </p>
        )}
        {!loading && !error && data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(
              [
                ['Coletas', data.current.jobs, data.previous.jobs, data.delta.jobs],
                ['Leads', data.current.leads, data.previous.leads, data.delta.leads],
                [
                  'LLM (USD)',
                  Number(data.current.llmCostUsd).toFixed(2),
                  Number(data.previous.llmCostUsd).toFixed(2),
                  data.delta.llmCostUsd,
                ],
              ] as Array<[string, number | string, number | string, number]>
            ).map(([label, current, previous, delta]) => {
              const d = fmtDelta(delta)
              return (
                <div key={label} className="rounded-lg border p-4">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold tabular-nums">{current}</p>
                  <p className="text-xs text-muted-foreground">
                    anterior: <span className="font-medium">{previous}</span>
                  </p>
                  <p className={`text-xs font-semibold ${toneClass[d.tone]}`}>{d.label}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
