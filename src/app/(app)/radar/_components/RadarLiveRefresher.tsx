'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCw, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLivePoll } from '@/lib/live/use-live-poll'
import { formatLastUpdated } from '@/lib/live-status'

/**
 * RadarLiveRefresher (A15, itens 035/050) — polling padronizado do radar via
 * useLivePoll (B22.1). Polla GET /api/v1/radar com cadencia de 30s; quando o
 * total ou o lead mais recente muda, faz router.refresh() para o server
 * component re-renderizar com os dados novos. Erro de poll e visivel
 * (sem silencio) com retry manual.
 */
interface RadarPayload {
  total?: number
  data?: Array<{ id: string }>
}

export function RadarLiveRefresher({ initialNewestId, initialTotal }: { initialNewestId: string | null; initialTotal: number }) {
  const router = useRouter()
  const lastSeenRef = useRef<{ newestId: string | null; total: number }>({
    newestId: initialNewestId,
    total: initialTotal,
  })

  const { data, error, lastUpdated, refresh } = useLivePoll<RadarPayload>(
    '/api/v1/radar',
    { intervalMs: 30_000 },
  )

  useEffect(() => {
    if (!data) return
    const newestId = data.data?.[0]?.id ?? null
    const total = data.total ?? data.data?.length ?? 0
    const prev = lastSeenRef.current
    if (newestId !== prev.newestId || total !== prev.total) {
      lastSeenRef.current = { newestId, total }
      toast.info('Novos dados no radar — atualizando a lista.')
      router.refresh()
    }
  }, [data, router])

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="radar-live-refresher">
      {error ? (
        <span role="alert" className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Falha ao atualizar: {error}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          {lastUpdated ? formatLastUpdated(lastUpdated.toISOString()) : 'Atualizacao automatica ativa'}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={() => void refresh()} data-testid="radar-refresh-now">
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Atualizar agora</span>
      </Button>
    </div>
  )
}
