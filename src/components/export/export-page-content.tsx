'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportForm } from './export-form'

export function ExportPageContent() {
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)

  // M12-B1 round 2: ler 9 dimensoes herdadas do /leads e SANEAR score na fronteira
  // (Codex caught: scoreMin=999 cru vazava da URL para o POST e era rejeitado em 422).
  const clampScore = (raw: string | null): number | undefined => {
    if (!raw) return undefined
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return undefined
    return Math.max(0, Math.min(100, n))
  }
  const filters = {
    search: searchParams.get('search') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    city: searchParams.get('city') ?? undefined,
    niche: searchParams.get('niche') ?? undefined,
    temperature: searchParams.get('temperature') ?? undefined,
    scoreMin: clampScore(searchParams.get('scoreMin')),
    scoreMax: clampScore(searchParams.get('scoreMax')),
    recency: searchParams.get('recency') ?? undefined,
  }

  return (
    <div data-testid="exportar-csv-card" className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-3">
          <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Exportação de Leads</h2>
          <p className="text-xs text-muted-foreground">Até 10.000 leads em CSV, XLSX, JSON ou vCard</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Exporte ate 10.000 leads em 4 formatos (CSV, XLSX, JSON, VCF). Volumes intermediarios podem ser enfileirados automaticamente — voce sera notificado em /exports quando o arquivo estiver pronto. Acima de 10.000 leads, refine os filtros: o sistema retorna erro orientando reducao do escopo. Os filtros aplicados em /leads sao herdados automaticamente.
      </p>

      <Button
        data-testid="exportar-csv-button"
        onClick={() => setShowForm(true)}
        className="min-h-[44px]"
      >
        <Download className="h-4 w-4 mr-2" aria-hidden="true" />
        Exportar leads
      </Button>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-background rounded-lg border p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h2 id="export-dialog-title" className="font-semibold">Exportar leads</h2>
            <ExportForm
              activeFilters={filters}
              onClose={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
