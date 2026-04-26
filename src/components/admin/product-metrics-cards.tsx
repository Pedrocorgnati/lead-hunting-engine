'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, TrendingDown, Users, Layers, Activity } from 'lucide-react'
import type { ProductMetricsPayload, ProductMetricStatus } from '@/lib/metrics/product-metrics'

type SlaCardKey = 'leadsPerJob' | 'fpRate' | 'avgCollectionTimeMin' | 'enrichmentCoverage'

interface CardSpec {
  key: SlaCardKey
  title: string
  icon: React.ReactNode
  format: (value: number) => string
  testId: string
}

const CARDS: CardSpec[] = [
  {
    key: 'leadsPerJob',
    title: 'Leads por coleta',
    icon: <Users className="h-5 w-5" />,
    format: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
    testId: 'product-metric-leads-per-job',
  },
  {
    key: 'fpRate',
    title: 'Taxa de FP',
    icon: <TrendingDown className="h-5 w-5" />,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    testId: 'product-metric-fp-rate',
  },
  {
    key: 'avgCollectionTimeMin',
    title: 'Tempo de coleta',
    icon: <Clock className="h-5 w-5" />,
    format: (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`,
    testId: 'product-metric-avg-time',
  },
  {
    key: 'enrichmentCoverage',
    title: 'Cobertura de enriquecimento',
    icon: <Layers className="h-5 w-5" />,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    testId: 'product-metric-coverage',
  },
]

function StatusBadge({ status }: { status: ProductMetricStatus['status'] }) {
  if (status === 'OK') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-transparent">
        OK
      </Badge>
    )
  }
  if (status === 'ALERTA') {
    return <Badge variant="destructive">ALERTA</Badge>
  }
  return <Badge variant="outline">Sem dados</Badge>
}

function ProductMetricCard({
  spec,
  metric,
}: {
  spec: CardSpec
  metric: ProductMetricStatus
}) {
  const valueDisplay = metric.value === null ? '—' : spec.format(metric.value)
  return (
    <Card data-testid={spec.testId}>
      <CardContent className="flex items-start gap-4 pt-4">
        <div className="rounded-lg bg-primary/10 p-3 text-primary" aria-hidden="true">
          {spec.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{spec.title}</p>
            <StatusBadge status={metric.status} />
          </div>
          <p
            className="text-2xl font-bold tabular-nums text-foreground"
            aria-label={`${spec.title}: ${valueDisplay}`}
          >
            {valueDisplay}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Meta: {metric.target}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando metricas de produto"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

export function ProductMetricsCards() {
  const [data, setData] = useState<ProductMetricsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/v1/admin/metrics/product', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (!cancelled) setData((body?.data ?? body) as ProductMetricsPayload)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar metricas de produto')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading && !data) return <CardsSkeleton />

  if (error && !data) {
    return (
      <div
        role="alert"
        data-testid="product-metrics-error"
        className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive"
      >
        Nao foi possivel carregar metricas de produto: {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <section
      data-testid="product-metrics-cards"
      aria-label="Metricas de produto (SLA)"
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">SLA de produto</h2>
        <p className="text-xs text-muted-foreground">Janela: ultimos {data.windowDays} dias</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((spec) => (
          <ProductMetricCard key={spec.key} spec={spec} metric={data[spec.key]} />
        ))}
      </div>

      {/* TASK-25/ST003 (CL-108): operadores ativos */}
      <ActiveOperatorsCard data={data.activeOperators} />
    </section>
  )
}

function ActiveOperatorsCard({ data }: { data: ProductMetricsPayload['activeOperators'] }) {
  const windows: Array<{ label: string; value: number; testId: string }> = [
    { label: '1d', value: data.d1, testId: 'active-operators-1d' },
    { label: '7d', value: data.d7, testId: 'active-operators-7d' },
    { label: '30d', value: data.d30, testId: 'active-operators-30d' },
  ]
  return (
    <Card data-testid="active-operators-card" className="mt-4">
      <CardContent className="flex items-start gap-4 pt-4">
        <div className="rounded-lg bg-primary/10 p-3 text-primary" aria-hidden="true">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Operadores ativos</p>
          <div className="mt-2 grid grid-cols-3 gap-4">
            {windows.map((w) => (
              <div key={w.label}>
                <p
                  className="text-2xl font-bold tabular-nums text-foreground"
                  data-testid={w.testId}
                  aria-label={`Operadores ativos nos últimos ${w.label}: ${w.value}`}
                >
                  {w.value}
                </p>
                <p className="text-xs text-muted-foreground">Últimos {w.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Usuários com ação registrada em auditoria na janela.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
