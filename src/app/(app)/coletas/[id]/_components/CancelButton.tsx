'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { XCircle } from 'lucide-react'
import { CollectionJobStatus } from '@/lib/constants/enums'

interface CancelButtonProps {
  jobId: string
  status: string
}

const CANCELLABLE: string[] = [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING]

export function CancelButton({ jobId, status }: CancelButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (!CANCELLABLE.includes(status)) return null

  async function handleCancel() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.userMessage ?? 'Falha ao cancelar coleta')
      }
      toast.success('Coleta cancelada.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar coleta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleCancel}
      disabled={loading}
      variant="outline"
      size="sm"
      data-testid="collection-detail-cancel-button"
    >
      <XCircle className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {loading ? 'Cancelando...' : 'Cancelar'}
    </Button>
  )
}
