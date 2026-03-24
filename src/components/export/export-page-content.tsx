'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportForm } from './export-form'

export function ExportPageContent() {
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)

  const filters = {
    search: searchParams.get('search') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    city: searchParams.get('city') ?? undefined,
    scoreMin: searchParams.get('scoreMin') ? parseInt(searchParams.get('scoreMin')!) : undefined,
    scoreMax: searchParams.get('scoreMax') ? parseInt(searchParams.get('scoreMax')!) : undefined,
  }

  return (
    <div data-testid="exportar-csv-card" className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-3">
          <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Exportação CSV</h2>
          <p className="text-xs text-muted-foreground">Até 500 leads com todos os campos</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Exporte até 500 leads em formato CSV. Os filtros aplicados na página de leads serão herdados automaticamente.
      </p>

      <Button
        data-testid="exportar-csv-button"
        onClick={() => setShowForm(true)}
        className="min-h-[44px]"
      >
        <Download className="h-4 w-4 mr-2" aria-hidden="true" />
        Exportar CSV
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
