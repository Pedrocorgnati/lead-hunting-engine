'use client'

import { useCallback, useEffect, useState } from 'react'
import { MetricCards, type MetricCardsData } from './MetricCards'
import { LeadsPerDayChart, type LeadsPerDayDatum } from './LeadsPerDayChart'
import { FunnelChart, type FunnelDatum } from './FunnelChart'
import { SourcePerformance, type SourceRow } from './SourcePerformance'

type Range = '7d' | '30d' | '90d' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
]

interface OverviewResponse {
  range: Range
  totals: { total: number }
  conversionRate: number
  avgScore: number
  avgTimeToQualifyMs: number | null
  leadsPerDay: LeadsPerDayDatum[]
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Request ${url} failed with status ${res.status}`)
  }
  const body = (await res.json()) as { data: T }
  return body.data
}

export function DashboardMetrics() {
  const [range, setRange] = useState<Range>('30d')
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [funnel, setFunnel] = useState<FunnelDatum[] | null>(null)
  const [sources, setSources] = useState<SourceRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (r: Range) => {
    setLoading(true)
    setError(null)
    try {
      const [o, f, s] = await Promise.all([
        fetchJSON<OverviewResponse>(`/api/v1/metrics/overview?range=${r}`),
        fetchJSON<FunnelDatum[]>(`/api/v1/metrics/funnel?range=${r}`),
        fetchJSON<SourceRow[]>(`/api/v1/metrics/by-source?range=${r}`),
      ])
      setOverview(o)
      setFunnel(f)
      setSources(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas')
      setOverview(null)
      setFunnel(null)
      setSources(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(range)
  }, [range, load])

  const cardsData: MetricCardsData | null = overview
    ? {
        totals: { total: overview.totals.total },
        conversionRate: overview.conversionRate,
        avgScore: overview.avgScore,
        avgTimeToQualifyMs: overview.avgTimeToQualifyMs,
      }
    : null

  return (
    <section
      data-testid="dashboard-metrics"
      aria-label="Métricas do dashboard"
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground">
          Métricas do período
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Período:</span>
          <select
            data-testid="metrics-range-select"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div
          data-testid="metrics-error"
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
          <button
            type="button"
            onClick={() => void load(range)}
            className="ml-3 underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <MetricCards data={cardsData} loading={loading} />
      <LeadsPerDayChart
        data={overview?.leadsPerDay ?? null}
        loading={loading}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChart data={funnel} loading={loading} />
        <SourcePerformance data={sources} loading={loading} />
      </div>
    </section>
  )
}
