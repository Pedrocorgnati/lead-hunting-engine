'use client'

import { useEffect, useState } from 'react'

type Period = 'day' | 'week' | 'month'

interface BreakdownRow {
  provider: string
  callType: string
  count: number
  creditTotal: number
}

interface BreakdownResponse {
  period: Period
  since: string
  breakdown: BreakdownRow[]
}

export function ApiUsageBreakdown() {
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<BreakdownResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/admin/metrics/api-usage?period=${period}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: BreakdownResponse }
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
  }, [period])

  const totalCalls = data?.breakdown.reduce((acc, r) => acc + r.count, 0) ?? 0
  const totalCredits = data?.breakdown.reduce((acc, r) => acc + r.creditTotal, 0) ?? 0

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Consumo de APIs externas</h2>
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded border px-3 py-1 text-sm ${
                period === p ? 'bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {p === 'day' ? '24h' : p === 'week' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Carregando breakdown...</p>}
      {error && <p className="text-sm text-destructive">Erro: {error}</p>}

      {!loading && !error && data && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {totalCalls} chamadas / {totalCredits} creditos — desde{' '}
            {new Date(data.since).toLocaleDateString('pt-BR')}
          </p>
          {data.breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem chamadas registradas neste periodo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Provider</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2 text-right">Chamadas</th>
                  <th className="py-2 text-right">Creditos</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.map((row) => (
                  <tr key={`${row.provider}-${row.callType}`} className="border-b last:border-0">
                    <td className="py-2 font-medium">{row.provider}</td>
                    <td className="py-2">{row.callType}</td>
                    <td className="py-2 text-right tabular-nums">{row.count}</td>
                    <td className="py-2 text-right tabular-nums">{row.creditTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
