'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function TriggerCleanupButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/cron/retention-cleanup', {
        headers: { 'x-cron-token': '' }, // token sera validado no server; manual trigger requer admin session
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { deleted: number; rawDeleted: number }
      toast.success(`Cleanup executado: ${data.deleted} leads e ${data.rawDeleted} dados brutos removidos`)
    } catch (e) {
      toast.error(`Erro ao executar cleanup: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? 'Executando...' : 'Executar agora'}
    </Button>
  )
}
