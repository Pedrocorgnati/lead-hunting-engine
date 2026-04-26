'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface PreviewResponse {
  totalLeads: number
  sampled: boolean
  changes: {
    coldToWarm: number
    warmToHot: number
    warmToCold: number
    hotToWarm: number
    coldToHot: number
    hotToCold: number
    unchanged: number
  }
}

interface Props {
  ruleSlug: string
  newWeight: number
  currentWeight: number
}

const DEBOUNCE_MS = 500

export function ScoringImpactPreview({ ruleSlug, newWeight, currentWeight }: Props) {
  const [data, setData] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (newWeight === currentWeight) {
      setData(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/v1/admin/config/scoring-rules/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleSlug, newWeight }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: PreviewResponse }
        if (!cancelled) setData(json.data)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ruleSlug, newWeight, currentWeight])

  if (newWeight === currentWeight) return null

  if (loading && !data) {
    return (
      <div
        className="flex items-center gap-2"
        aria-live="polite"
        aria-busy="true"
        data-testid="scoring-impact-preview-loading"
      >
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-xs text-destructive" data-testid="scoring-impact-preview-error">
        Erro ao calcular impacto: {error}
      </p>
    )
  }

  if (!data) return null

  if (data.totalLeads === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="scoring-impact-preview-empty"
      >
        Sem leads para analisar.
      </p>
    )
  }

  const { changes, sampled, totalLeads } = data
  const upgrades = changes.coldToWarm + changes.warmToHot + changes.coldToHot
  const downgrades = changes.warmToCold + changes.hotToWarm + changes.hotToCold

  if (upgrades === 0 && downgrades === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="scoring-impact-preview-zero"
      >
        Nenhum lead muda de temperatura com este peso.
      </p>
    )
  }

  return (
    <div className="space-y-1" data-testid="scoring-impact-preview">
      <div className="flex flex-wrap items-center gap-1.5">
        {upgrades > 0 && (
          <Badge variant="default" data-testid="scoring-impact-preview-upgrades">
            +{upgrades} sobe
          </Badge>
        )}
        {downgrades > 0 && (
          <Badge variant="secondary" data-testid="scoring-impact-preview-downgrades">
            -{downgrades} desce
          </Badge>
        )}
        {changes.warmToHot > 0 && (
          <Badge variant="destructive">+{changes.warmToHot} p/ quente</Badge>
        )}
      </div>
      {sampled && (
        <p className="text-[10px] text-muted-foreground">
          Amostra de 1000 de {totalLeads} leads.
        </p>
      )}
    </div>
  )
}
