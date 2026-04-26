'use client'

/**
 * TASK-25/ST004 (CL-109): card global de falso-positivo agregado.
 * Consome /api/v1/admin/metrics/false-positive.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface FpPayload {
  days: number
  totalLeads: number
  falsePositives: number
  rate: number | null
}

export function FalsePositiveGlobalCard({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<FpPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/v1/admin/metrics/false-positive?days=${days}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as { data: FpPayload }
        if (!cancelled) {
          setData(json.data)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Erro ao carregar taxa de falso-positivo')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  if (loading) {
    return (
      <Card data-testid="fp-global-loading">
        <CardContent className="flex items-center gap-3 pt-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando taxa de falso-positivo…
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-destructive">
          {error ?? 'Sem dados'}
        </CardContent>
      </Card>
    )
  }

  const pct = data.rate === null ? '—' : `${(data.rate * 100).toFixed(1)}%`
  const status =
    data.rate === null ? 'SEM_DADOS' : data.rate < 0.2 ? 'OK' : 'ALERTA'

  return (
    <Card data-testid="fp-global-card">
      <CardContent className="flex items-start gap-4 pt-4">
        <div
          className={`rounded-lg p-3 ${
            status === 'ALERTA'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'
          }`}
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Falso-positivo (global)</p>
          <p
            className="text-2xl font-bold tabular-nums text-foreground"
            aria-label={`Taxa de falso-positivo global nos últimos ${data.days} dias: ${pct}`}
          >
            {pct}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.falsePositives}/{data.totalLeads} leads · últimos {data.days}d · meta &lt; 20%
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
