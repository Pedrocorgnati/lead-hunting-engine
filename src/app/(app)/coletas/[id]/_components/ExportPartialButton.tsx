'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface ExportPartialButtonProps {
  jobId: string
  leadsCount: number
}

export function ExportPartialButton({ jobId, leadsCount }: ExportPartialButtonProps) {
  const [loading, setLoading] = useState(false)

  if (leadsCount === 0) return null

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/export-partial`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.userMessage ?? 'Falha ao exportar leads')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coleta-${jobId}-parcial.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${leadsCount} leads exportados.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar leads')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleExport}
      disabled={loading}
      variant="outline"
      size="sm"
      data-testid="collection-detail-export-button"
    >
      <Download className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {loading ? 'Exportando...' : `Exportar (${leadsCount})`}
    </Button>
  )
}
