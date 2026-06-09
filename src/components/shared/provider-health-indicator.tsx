'use client'

/**
 * ProviderHealthIndicator - indicador compacto de saude de provedores para
 * o header admin (G16).
 *
 * Consome ProviderHealthContext (sem polling proprio). Exibe:
 * - Nenhum badge quando todos os providers estao UP.
 * - Badge destructive com contagem quando ha providers DOWN/PAUSED.
 * - Badge outline com contagem quando ha providers DEGRADED (sem DOWN/PAUSED).
 *
 * Renderizado apenas para admins (decisao do caller, nao deste componente).
 */

import Link from 'next/link'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useProviderHealthContext } from '@/lib/contexts/provider-health-context'
export function ProviderHealthIndicator() {
  const { bySource, loading } = useProviderHealthContext()

  if (loading || bySource.size === 0) return null

  const items = Array.from(bySource.values())
  const down = items.filter((p) => p.status === 'DOWN' || p.status === 'PAUSED')
  const degraded = items.filter((p) => p.status === 'DEGRADED')

  if (down.length === 0 && degraded.length === 0) return null

  const variant = down.length > 0 ? 'destructive' : 'outline'
  const count = down.length > 0 ? down.length : degraded.length
  const label = down.length > 0
    ? `${count} provedor${count > 1 ? 'es' : ''} fora do ar`
    : `${count} provedor${count > 1 ? 'es' : ''} degradado${count > 1 ? 's' : ''}`
  const names = (down.length > 0 ? down : degraded).map((p) => p.label).join(', ')

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/admin/provedores"
              data-testid="provider-health-indicator"
              aria-label={label}
              className="flex items-center gap-1"
            />
          }
        >
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Badge variant={variant} className="text-xs">
            {count}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs max-w-xs">
          <p className="font-semibold mb-1">{label}</p>
          <p className="text-muted-foreground">{names}</p>
          <p className="mt-1 opacity-70">Clique para gerenciar provedores</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
