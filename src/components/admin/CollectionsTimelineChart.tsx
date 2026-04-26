'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * CollectionsTimelineChart — sparkline SVG com jobs/leads diarios (30 dias).
 * Segue padrao `LlmCostChart` (sem recharts para reduzir bundle).
 *
 * Origem: TASK-13 intake-review / ST004 (CL-115).
 */
interface TimelinePoint {
  date: string
  jobs: number
  leads: number
  costUsd: string
}

interface TimelineResponse {
  days: number
  series: TimelinePoint[]
}

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const stepX = width / Math.max(1, values.length - 1)
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = height - (v / max) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function CollectionsTimelineChart() {
  const [data, setData] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/metrics/collections-timeline?days=30')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: TimelineResponse }
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
  }, [])

  const width = 640
  const height = 120

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linha do tempo — ultimos 30 dias</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <Skeleton className="h-[120px] w-full rounded-md" />}
        {!loading && error && (
          <p className="text-sm text-destructive" role="alert">
            Erro ao carregar timeline: {error}
          </p>
        )}
        {!loading && !error && data && data.series.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sem dados suficientes para a linha do tempo.
          </p>
        )}
        {!loading && !error && data && data.series.length > 0 && (
          <div className="space-y-2">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-[120px]"
              role="img"
              aria-label="Grafico de coletas e leads por dia"
            >
              <path
                d={buildPath(data.series.map((p) => p.jobs), width, height)}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-primary"
              />
              <path
                d={buildPath(data.series.map((p) => p.leads), width, height)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                className="text-emerald-600"
              />
            </svg>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>— coletas</span>
              <span className="text-emerald-600">-- leads</span>
              <span className="ml-auto">
                {data.series[0].date} → {data.series[data.series.length - 1].date}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
