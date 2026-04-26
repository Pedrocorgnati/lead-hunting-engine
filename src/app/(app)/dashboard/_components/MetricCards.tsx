'use client'

import { Users, TrendingUp, Gauge, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export interface MetricCardsData {
  totals: { total: number }
  conversionRate: number
  avgScore: number
  avgTimeToQualifyMs: number | null
}

interface Props {
  data: MetricCardsData | null
  loading?: boolean
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function CardShell({
  label,
  value,
  icon: Icon,
  sub,
  testId,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  sub: string
  testId: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border bg-card p-4 space-y-2"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden={true} />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

export function MetricCards({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <div
        data-testid="metric-cards-loading"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    )
  }

  if (data.totals.total === 0) {
    return (
      <div
        data-testid="metric-cards-empty"
        className="rounded-lg border bg-card p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">
          Nenhum lead no período selecionado.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Inicie uma coleta para ver as métricas.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="metric-cards-grid"
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <CardShell
        testId="metric-card-total"
        label="Total de leads"
        value={String(data.totals.total)}
        icon={Users}
        sub="no período"
      />
      <CardShell
        testId="metric-card-conversion"
        label="Taxa de conversão"
        value={formatPercent(data.conversionRate)}
        icon={TrendingUp}
        sub="leads convertidos"
      />
      <CardShell
        testId="metric-card-score"
        label="Score médio"
        value={String(data.avgScore)}
        icon={Gauge}
        sub="qualidade agregada"
      />
      <CardShell
        testId="metric-card-ttq"
        label="Tempo médio p/ qualificar"
        value={formatDuration(data.avgTimeToQualifyMs)}
        icon={Clock}
        sub="criação → contato"
      />
    </div>
  )
}
