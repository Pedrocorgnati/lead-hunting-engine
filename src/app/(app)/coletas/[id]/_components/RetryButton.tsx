'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface RetryButtonProps {
  jobId: string
  status: string
}

export function RetryButton({ jobId, status }: RetryButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (status !== 'FAILED') return null

  async function handleRetry() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('Falha ao recriar coleta')
      const json = await res.json()
      const newId = json.data?.id
      toast.success('Nova coleta iniciada', {
        action: newId
          ? { label: 'Abrir', onClick: () => router.push(`/coletas/${newId}`) }
          : undefined,
      })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao tentar novamente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleRetry} disabled={loading} variant="outline" size="sm">
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Recriando...' : 'Tentar novamente'}
    </Button>
  )
}
