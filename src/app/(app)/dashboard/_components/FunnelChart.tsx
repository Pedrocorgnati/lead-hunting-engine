'use client'

import { Skeleton } from '@/components/ui/skeleton'

export interface FunnelDatum {
  stage: string
  count: number
}

interface Props {
  data: FunnelDatum[] | null
  loading?: boolean
}

export function FunnelChart({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <div
        data-testid="funnel-chart-loading"
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0 || data.every((s) => s.count === 0)) {
    return (
      <div
        data-testid="funnel-chart-empty"
        className="rounded-lg border bg-card p-8 text-center"
      >
        <h2 className="text-base font-semibold text-foreground mb-2">Funil</h2>
        <p className="text-sm text-muted-foreground">
          Sem leads para compor o funil.
        </p>
      </div>
    )
  }

  const max = Math.max(...data.map((s) => s.count), 1)
  const first = data[0]?.count ?? 0

  return (
    <div
      data-testid="funnel-chart"
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <h2 className="text-base font-semibold text-foreground">Funil</h2>
      <div className="space-y-2">
        {data.map((stage) => {
          const widthPct = (stage.count / max) * 100
          const stagePct = first === 0 ? 0 : (stage.count / first) * 100
          return (
            <div
              key={stage.stage}
              data-testid={`funnel-stage-${stage.stage}`}
              className="space-y-1"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{stage.stage}</span>
                <span>
                  {stage.count} · {stagePct.toFixed(1)}%
                </span>
              </div>
              <div className="h-6 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${widthPct}%` }}
                  aria-label={`${stage.stage}: ${stage.count}`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
