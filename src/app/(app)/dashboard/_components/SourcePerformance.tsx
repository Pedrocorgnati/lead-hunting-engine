'use client'

import { useState, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export interface SourceRow {
  source: string
  count: number
  conversionRate: number
  avgScore: number
}

interface Props {
  data: SourceRow[] | null
  loading?: boolean
}

type SortKey = 'source' | 'count' | 'conversionRate' | 'avgScore'

function formatPercent(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

export function SourcePerformance({ data, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    if (!data) return []
    const clone = [...data]
    clone.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
    return clone
  }, [data, sortKey, sortDir])

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (loading || !data) {
    return (
      <div
        data-testid="source-performance-loading"
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        data-testid="source-performance-empty"
        className="rounded-lg border bg-card p-8 text-center"
      >
        <h2 className="text-base font-semibold text-foreground mb-2">
          Performance por fonte
        </h2>
        <p className="text-sm text-muted-foreground">
          Nenhuma fonte com leads no período.
        </p>
      </div>
    )
  }

  const indicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div
      data-testid="source-performance"
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <h2 className="text-base font-semibold text-foreground">
        Performance por fonte
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4">
                <button
                  type="button"
                  onClick={() => toggle('source')}
                  className="hover:text-foreground transition-colors"
                >
                  Fonte{indicator('source')}
                </button>
              </th>
              <th className="py-2 pr-4 text-right">
                <button
                  type="button"
                  onClick={() => toggle('count')}
                  className="hover:text-foreground transition-colors"
                >
                  Leads{indicator('count')}
                </button>
              </th>
              <th className="py-2 pr-4 text-right">
                <button
                  type="button"
                  onClick={() => toggle('conversionRate')}
                  className="hover:text-foreground transition-colors"
                >
                  Conversão{indicator('conversionRate')}
                </button>
              </th>
              <th className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => toggle('avgScore')}
                  className="hover:text-foreground transition-colors"
                >
                  Score médio{indicator('avgScore')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.source}
                data-testid={`source-row-${row.source}`}
                className="border-b last:border-b-0"
              >
                <td className="py-2 pr-4 font-medium text-foreground">
                  {row.source}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{row.count}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  {formatPercent(row.conversionRate)}
                </td>
                <td className="py-2 text-right font-mono">{row.avgScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
