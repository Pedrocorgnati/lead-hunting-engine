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

type ExportFormat = 'CSV' | 'JSON' | 'VCF'

const EXT: Record<ExportFormat, string> = { CSV: 'csv', JSON: 'json', VCF: 'vcf' }
const FORMATS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'CSV', label: 'CSV', hint: 'Planilhas (Excel, Sheets)' },
  { value: 'JSON', label: 'JSON', hint: 'Integracoes e scripts' },
  { value: 'VCF', label: 'vCard', hint: 'Agenda de contatos' },
]

export function ExportForm({ activeFilters = {}, onClose }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<ExportFormat>('CSV')

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
        body: JSON.stringify({ ...activeFilters, format }),
      })

      if (res.status === 413) {
        setError(
          'O resultado dos filtros ultrapassa 10.000 leads. Use a exportacao assincrona (em breve).'
        )
        return
      }
      if (!res.ok) {
        throw new Error('Erro ao gerar exportacao. Tente novamente.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${new Date().toISOString().split('T')[0]}.${EXT[format]}`
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
      <div
        role="radiogroup"
        aria-label="Formato de exportacao"
        className="grid grid-cols-3 gap-2"
      >
        {FORMATS.map((opt) => (
          <label
            key={opt.value}
            className={
              'flex cursor-pointer flex-col rounded-lg border p-3 text-sm transition-colors ' +
              (format === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-accent')
            }
          >
            <input
              type="radio"
              name="export-format"
              value={opt.value}
              checked={format === opt.value}
              onChange={() => setFormat(opt.value)}
              className="sr-only"
            />
            <span className="font-semibold">{opt.label}</span>
            <span className="text-xs text-muted-foreground">{opt.hint}</span>
          </label>
        ))}
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        <p className="font-medium">Resumo da exportacao</p>
        <p className="text-muted-foreground">
          Ate 10.000 leads serao exportados em {format}, ordenados por score.
        </p>
        {hasFilters && (
          <p className="text-muted-foreground text-xs">
            Filtros ativos serao aplicados.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={loading}
          className="min-h-[44px]"
        >
          Cancelar
        </Button>
        <Button
          onClick={handleExport}
          disabled={loading}
          className="min-h-[44px]"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Gerando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Exportar {format}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
