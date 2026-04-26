'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RecomputeButtonProps {
  leadId: string
}

export function RecomputeButton({ leadId }: RecomputeButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/recompute-score`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao recalcular score')
      }
      const json = await res.json()
      toast.success(`Score recalculado: ${json.data?.score}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} variant="outline" size="sm">
      <Calculator className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} />
      {loading ? 'Recalculando...' : 'Recalcular score'}
    </Button>
  )
}
