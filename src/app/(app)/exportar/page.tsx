import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ExportPageContent } from '@/components/export/export-page-content'

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
      <Suspense fallback={null}>
        <ExportPageContent />
      </Suspense>
    </div>
  )
}
