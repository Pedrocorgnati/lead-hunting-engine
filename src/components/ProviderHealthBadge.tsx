'use client'

/**
 * ProviderHealthBadge - badge global de health de provider (G16).
 *
 * Origem: Task 62 / C11 (loop 05-27-lead-hunting-engine-explained).
 *
 * Fonte de dados: ProviderHealthContext (polling compartilhado de 30s para
 * GET /api/v1/health/providers — endpoint operator-safe com lastError
 * mascarado; calculo compartilhado com o admin em
 * src/lib/providers/health-status.ts). Nunca expoe a chave de API
 * (Zero Assumido, zero segredo vazado para operador).
 *
 * - Tooltip expandivel: latencia, quota, rate-limit, erro recente, fallback.
 * - Custo: indisponivel nesta fase (ApiCredential nao possui campo de custo
 *   agregado nem quota); marcado explicitamente (Zero Assumido).
 * - Loading / error / not-found / success cobertos (Zero Estados Indefinidos).
 */

import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Loader2 } from 'lucide-react'
import { formatLastUpdated } from '@/lib/live-status'
import { useProviderHealthContext } from '@/lib/contexts/provider-health-context'
import type { ProviderHealthItem } from '@/lib/contexts/provider-health-context'
import { cn } from '@/lib/utils'

export interface ProviderHealthBadgeProps {
  provider: string
  className?: string
}

type ProviderStatus = ProviderHealthItem['status']

const STATUS_BADGE: Record<ProviderStatus, { label: string; className: string }> = {
  UP: {
    label: 'Operacional',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  DEGRADED: {
    label: 'Degradado',
    className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  },
  DOWN: {
    label: 'Fora do ar',
    className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300',
  },
  PAUSED: {
    label: 'Pausado',
    className: 'border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-300',
  },
  UNCONFIGURED: {
    label: 'Não configurado',
    className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
  },
}

function fmtLatency(ms: number | null): string {
  return ms === null ? 'indisponivel' : `${ms} ms`
}

function fmtQuota(remaining: number | null): string {
  return remaining === null ? 'indisponivel nesta fase' : remaining.toLocaleString('pt-BR')
}

function fmtResetAt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR') : 'sem limite ativo'
}

export function ProviderHealthBadge({ provider, className }: ProviderHealthBadgeProps) {
  const liveRegionId = useId()
  const { loading, error, getProvider } = useProviderHealthContext()
  const item = getProvider(provider)

  if (loading) {
    return (
      <span role="status" aria-label="Carregando status do provedor...">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </span>
    )
  }

  if (error) {
    return (
      <>
        <Badge
          variant="destructive"
          className={className}
          data-testid={`provider-health-badge-${provider}`}
          data-state="error"
          aria-describedby={liveRegionId}
        >
          Erro: {provider}
        </Badge>
        <span id={liveRegionId} role="status" aria-live="polite" className="sr-only">
          Falha ao consultar status do provedor {provider}. Tentando reconectar.
        </span>
      </>
    )
  }

  if (!item) {
    return (
      <>
        <Badge
          variant="outline"
          className={className}
          data-testid={`provider-health-badge-${provider}`}
          data-state="not-found"
          aria-describedby={liveRegionId}
        >
          {provider}: desconhecido
        </Badge>
        <span id={liveRegionId} role="status" aria-live="polite" className="sr-only">
          Provedor {provider} nao encontrado no catalogo de status.
        </span>
      </>
    )
  }

  const badge = STATUS_BADGE[item.status]

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={cn(badge.className, className)}
            data-testid={`provider-health-badge-${provider}`}
            data-state={item.status}
            aria-describedby={liveRegionId}
            aria-label={`Provedor ${item.label}: ${badge.label}`}
          >
            {badge.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="space-y-1">
            <p className="font-semibold">{item.label}: {badge.label}</p>
            <p>Latencia: {fmtLatency(item.latencyMs)}</p>
            <p>Quota restante: {fmtQuota(item.quotaRemaining)}</p>
            <p>Rate-limit reset: {fmtResetAt(item.rateLimitResetAt)}</p>
            <p>Erro recente: {item.lastError ?? 'nenhum'}</p>
            <p>Fallback: {item.fallbackProvider ?? 'nenhum'}</p>
            <p>Custo: indisponivel nesta fase</p>
            <p className="opacity-70">{formatLastUpdated(item.updatedAt)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
      <span id={liveRegionId} role="status" aria-live="polite" className="sr-only">
        Provedor {item.label}: {badge.label}
      </span>
    </TooltipProvider>
  )
}
