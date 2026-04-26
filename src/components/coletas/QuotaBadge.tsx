'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { API_ROUTES } from '@/lib/constants/routes'
import type { QuotaSnapshot } from '@/lib/services/quota-enforcer'

export interface QuotaBadgeProps {
  className?: string
  refreshKey?: number
}

/**
 * Badge com quota mensal de leads + coletas simultaneas.
 * Consome GET /api/v1/jobs/quota (CL-228 / INTAKE-REVIEW TASK-3 ST003).
 */
export function QuotaBadge({ className, refreshKey }: QuotaBadgeProps) {
  const [snapshot, setSnapshot] = useState<QuotaSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(API_ROUTES.JOBS_QUOTA, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json() as Promise<{ data: QuotaSnapshot }>
      })
      .then((payload) => {
        if (!cancelled) setSnapshot(payload.data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (loading) {
    return (
      <div
        className={cn('h-6 w-40 rounded-md bg-muted animate-pulse', className)}
        data-testid="quota-badge-loading"
        aria-hidden="true"
      />
    )
  }

  if (error || !snapshot) {
    return (
      <Badge
        variant="outline"
        className={cn('text-xs text-muted-foreground', className)}
        data-testid="quota-badge-error"
      >
        <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
        Quota indisponível
      </Badge>
    )
  }

  const monthlyBlocked = !snapshot.monthly.allowed
  const concurrentBlocked = !snapshot.concurrency.allowed
  const nearLimit = snapshot.monthly.used / snapshot.monthly.max >= 0.8
  const variant: 'default' | 'secondary' | 'destructive' =
    monthlyBlocked || concurrentBlocked ? 'destructive' : nearLimit ? 'default' : 'secondary'

  return (
    <div className={cn('flex flex-wrap gap-2', className)} data-testid="quota-badge">
      <Badge
        variant={variant}
        className="text-xs gap-1"
        data-testid="quota-badge-monthly"
        title={`Reseta em ${new Date(snapshot.monthly.resetAt).toLocaleDateString('pt-BR')}`}
      >
        <Gauge className="h-3 w-3" aria-hidden="true" />
        {snapshot.monthly.used}/{snapshot.monthly.max} leads este mês
      </Badge>
      <Badge
        variant={concurrentBlocked ? 'destructive' : 'outline'}
        className="text-xs"
        data-testid="quota-badge-concurrency"
      >
        {snapshot.concurrency.running}/{snapshot.concurrency.max} coletas simultâneas
      </Badge>
    </div>
  )
}
