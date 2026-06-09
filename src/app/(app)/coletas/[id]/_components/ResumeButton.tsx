'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play } from 'lucide-react'
import { CollectionJobStatus } from '@/lib/constants/enums'

interface ResumeButtonProps {
  jobId: string
  status: string
}

const RESUMABLE: string[] = [CollectionJobStatus.PAUSED, CollectionJobStatus.PARTIAL]

export function ResumeButton({ jobId, status }: ResumeButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (!RESUMABLE.includes(status)) return null

  async function handleResume() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/resume`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.userMessage ?? 'Falha ao retomar coleta')
      }
      toast.success('Coleta retomada.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao retomar coleta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleResume}
      disabled={loading}
      variant="outline"
      size="sm"
      data-testid="collection-detail-resume-button"
    >
      <Play className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {loading ? 'Retomando...' : 'Retomar'}
    </Button>
  )
}
