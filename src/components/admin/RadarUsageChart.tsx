'use client'

import { useEffect, useState } from 'react'

type Range = '7d' | '30d' | '90d' | 'all'

interface Row {
  userId: string
  email: string | null
  radarJobs: number
  newLeadsFromRadar: number
}

interface Response {
  range: Range
  rows: Row[]
}

export function RadarUsageChart() {
  const [range, setRange] = useState<Range>('30d')
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/admin/metrics/radar?range=${range}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: Response }
        if (!cancelled) setData(json.data)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [range])

  const max = Math.max(1, ...(data?.rows.map((r) => r.radarJobs) ?? [0]))

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Uso do Radar por operador</h2>
        <div className="flex gap-1">
          {(['7d', '30d', '90d', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded border px-3 py-1 text-sm ${
                range === r ? 'bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Carregando uso do Radar...</p>}
      {error && <p className="text-sm text-destructive">Erro: {error}</p>}

      {!loading && !error && data && data.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum uso do Radar no periodo.</p>
      )}

      {!loading && !error && data && data.rows.length > 0 && (
        <ul className="space-y-2">
          {data.rows.slice(0, 20).map((row) => (
            <li key={row.userId} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm" title={row.email ?? row.userId}>
                {row.email ?? row.userId.slice(0, 8)}
              </span>
              <div className="h-2 w-48 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(row.radarJobs / max) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                {row.radarJobs} jobs / {row.newLeadsFromRadar} leads
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
