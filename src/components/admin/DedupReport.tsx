'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface WindowStats {
  PENDING: number
  MERGED: number
  KEEP_BOTH: number
  REJECTED: number
  UNDONE: number
  undoRate: number
}

interface DedupMetricsResponse {
  all: WindowStats
  last7: WindowStats
  last30: WindowStats
}

function Card({ title, stats }: { title: string; stats: WindowStats }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Pending</dt>
        <dd className="font-mono text-right">{stats.PENDING}</dd>
        <dt className="text-muted-foreground">Merged</dt>
        <dd className="font-mono text-right">{stats.MERGED}</dd>
        <dt className="text-muted-foreground">Keep both</dt>
        <dd className="font-mono text-right">{stats.KEEP_BOTH}</dd>
        <dt className="text-muted-foreground">Rejected</dt>
        <dd className="font-mono text-right">{stats.REJECTED}</dd>
        <dt className="text-muted-foreground">Undone</dt>
        <dd className="font-mono text-right">{stats.UNDONE}</dd>
        <dt className="text-muted-foreground">Undo rate</dt>
        <dd className="font-mono text-right">
          {(stats.undoRate * 100).toFixed(1)}%
        </dd>
      </dl>
    </div>
  )
}

export function DedupReport() {
  const [data, setData] = useState<DedupMetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/metrics/dedup')
        if (!res.ok) throw new Error()
        const json = (await res.json()) as { data: DedupMetricsResponse }
        if (active) setData(json.data)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <Skeleton className="h-48 w-full" />
  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Nao foi possivel carregar metricas.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="Ultimos 7 dias" stats={data.last7} />
      <Card title="Ultimos 30 dias" stats={data.last30} />
      <Card title="Acumulado" stats={data.all} />
    </div>
  )
}
