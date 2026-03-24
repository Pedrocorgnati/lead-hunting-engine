'use client'
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'

interface ExportFilters {
  status?: string
  type?: string
  search?: string
  scoreMin?: number
  scoreMax?: number
}

interface Props {
  activeFilters?: ExportFilters
  onClose: () => void
}

const MAX_EXPORT = 500

export function ExportForm({ activeFilters = {}, onClose }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFilters = Object.values(activeFilters).some(
    (v) => v !== undefined && v !== ''
  )

  async function handleExport() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...activeFilters,
          format: 'csv',
        }),
      })

      if (!res.ok) {
        throw new Error('Erro ao gerar exportação. Tente novamente.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Leads exportados com sucesso.')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        <p className="font-medium">Resumo da exportação</p>
        <p className="text-muted-foreground">
          Até {MAX_EXPORT} leads serão exportados em formato CSV, ordenados por score.
        </p>
        {hasFilters && (
          <p className="text-muted-foreground text-xs">Filtros ativos serão aplicados.</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      <p className="text-sm text-muted-foreground">
        O arquivo CSV será baixado automaticamente ao confirmar.
      </p>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose} disabled={loading} className="min-h-[44px]">
          Cancelar
        </Button>
        <Button onClick={handleExport} disabled={loading} className="min-h-[44px]">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Gerando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Exportar CSV
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
