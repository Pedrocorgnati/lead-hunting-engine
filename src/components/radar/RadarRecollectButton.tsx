'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/lib/hooks/use-toast'
import { API_ROUTES, Routes } from '@/lib/constants/routes'

export interface RadarRecollectButtonProps {
  city: string
  state: string | null
  niche: string
  lastCollectedAt: string | null
}

export function RadarRecollectButton({
  city,
  state,
  niche,
  lastCollectedAt,
}: RadarRecollectButtonProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const router = useRouter()

  const locationLabel = state ? `${city}, ${state}` : city
  const lastLabel = lastCollectedAt
    ? new Date(lastCollectedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'nunca'

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.RADAR_RECOLLECT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city, state, niche }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        const message =
          payload?.error?.message ?? 'Não foi possível iniciar a recoleta.'
        toast.error(message)
        return
      }
      const data = (await res.json()) as { data: { jobId: string } }
      toast.success('Recoleta iniciada. Acompanhe em Coletas.')
      setOpen(false)
      startTransition(() => {
        router.push(Routes.COLLECTION_DETAIL(data.data.jobId))
        router.refresh()
      })
    } catch {
      toast.error('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`radar-recollect-${niche}-${city}`.toLowerCase().replace(/\s+/g, '-')}
      >
        <RefreshCcw className="h-4 w-4 mr-1" aria-hidden="true" />
        Recoletar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Recoletar este preset?"
        description={
          <span>
            Vamos disparar uma nova coleta para <strong>{niche}</strong> em{' '}
            <strong>{locationLabel}</strong>. Isso consome quota mensal. Última
            coleta: {lastLabel}.
          </span>
        }
        confirmLabel="Disparar recoleta"
        loading={loading || isPending}
        onConfirm={handleConfirm}
      />
    </>
  )
}
