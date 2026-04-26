'use client'

import { Skeleton } from '@/components/ui/skeleton'

export interface LeadsPerDayDatum {
  date: string
  count: number
}

interface Props {
  data: LeadsPerDayDatum[] | null
  loading?: boolean
}

const WIDTH = 800
const HEIGHT = 220
const PAD_X = 32
const PAD_Y = 24

function formatLabel(iso: string): string {
  // YYYY-MM-DD → DD/MM
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function LeadsPerDayChart({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <div
        data-testid="leads-per-day-loading"
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    )
  }

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div
        data-testid="leads-per-day-empty"
        className="rounded-lg border bg-card p-8 text-center"
      >
        <h2 className="text-base font-semibold text-foreground mb-2">
          Leads por dia
        </h2>
        <p className="text-sm text-muted-foreground">
          Sem leads registrados neste período.
        </p>
      </div>
    )
  }

  const max = Math.max(...data.map((d) => d.count), 1)
  const innerW = WIDTH - PAD_X * 2
  const innerH = HEIGHT - PAD_Y * 2
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0

  const points = data.map((d, i) => {
    const x = PAD_X + stepX * i
    const y = PAD_Y + innerH - (d.count / max) * innerH
    return { x, y, count: d.count, date: d.date }
  })

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const areaD =
    pathD +
    ` L ${points[points.length - 1].x.toFixed(2)} ${(PAD_Y + innerH).toFixed(2)}` +
    ` L ${points[0].x.toFixed(2)} ${(PAD_Y + innerH).toFixed(2)} Z`

  // Eixo X: mostra alguns rótulos (~6 ticks)
  const tickStep = Math.max(1, Math.floor(data.length / 6))

  return (
    <div
      data-testid="leads-per-day-chart"
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <h2 className="text-base font-semibold text-foreground">Leads por dia</h2>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gráfico de leads por dia"
        className="w-full h-auto"
      >
        <path d={areaD} fill="currentColor" className="text-primary/10" />
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-primary"
        />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="currentColor"
            className="text-primary"
          >
            <title>
              {formatLabel(p.date)}: {p.count}
            </title>
          </circle>
        ))}
        {points.map((p, i) =>
          i % tickStep === 0 || i === points.length - 1 ? (
            <text
              key={`t-${p.date}`}
              x={p.x}
              y={HEIGHT - 6}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              className="text-muted-foreground"
            >
              {formatLabel(p.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}
