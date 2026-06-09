'use client'

/**
 * ProviderHealthBadge - badge global de health de provider (G16).
 *
 * Origem: Task 62 / C11 (loop 05-27-lead-hunting-engine-explained).
 *
 * Fonte de dados: ProviderHealthContext (polling compartilhado de 30s para
 * GET /api/v1/admin/providers/status). O endpoint retorna health derivado por
 * provider do PROVIDER_CATALOG (status, latencia, quota, rate-limit, ultimo
 * erro, fallback). Nunca expoe a chave de API (Zero Assumido, zero segredo
 * vazado para operador).
 *
 * O endpoint GET /api/v1/health/providers citado na task nao existe nesta fase
 * (apenas health/maintenance-window e health/feature-flags); admin/providers/status
 * e a unica fonte real e seu doc-comment declara "Consumido por G16 ProviderHealthBadge".
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

export interface ProviderHealthBadgeProps {
  provider: string
  className?: string
}

type ProviderStatus = ProviderHealthItem['status']

const VARIANT: Record<ProviderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  UP: 'secondary',
  DEGRADED: 'outline',
  DOWN: 'destructive',
  PAUSED: 'destructive',
}

const STATUS_LABEL: Record<ProviderStatus, string> = {
  UP: 'Operacional',
  DEGRADED: 'Degradado',
  DOWN: 'Fora do ar',
  PAUSED: 'Pausado',
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

  const statusLabel = STATUS_LABEL[item.status]

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant={VARIANT[item.status]}
            className={className}
            data-testid={`provider-health-badge-${provider}`}
            data-state={item.status}
            aria-describedby={liveRegionId}
            aria-label={`Provedor ${item.label}: ${statusLabel}`}
          >
            {statusLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="space-y-1">
            <p className="font-semibold">{item.label}: {statusLabel}</p>
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
        Provedor {item.label}: {statusLabel}
      </span>
    </TooltipProvider>
  )
}
