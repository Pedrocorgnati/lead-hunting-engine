import type { Metadata } from 'next'
import { Download, FileText } from 'lucide-react'

export const metadata: Metadata = { title: 'Exportar Leads' }

export default function ExportarPage() {
  return (
    <div data-testid="exportar-page" className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exportar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exporte seus leads em formato CSV para análise externa
        </p>
      </div>

      <div data-testid="exportar-csv-card" className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-3">
            <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Exportação CSV</h2>
            <p className="text-xs text-muted-foreground">Todos os campos dos leads selecionados</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
          A exportação será disponibilizada após a implementação do backend.
        </div>

        <button
          data-testid="exportar-csv-button"
          disabled
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50 min-h-[44px]"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </button>
      </div>
    </div>
  )
}
