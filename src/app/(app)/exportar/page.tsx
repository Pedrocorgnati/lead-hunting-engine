import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { History, Send } from 'lucide-react'
import { ExportPageContent } from '@/components/export/export-page-content'
import { Routes } from '@/lib/constants/routes'

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

      <nav aria-label="Outras opções de exportação" className="grid gap-3 sm:grid-cols-2">
        <Link
          href={Routes.EXPORTAR_HISTORICO}
          data-testid="exportar-link-historico"
          className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <History className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Histórico de exportações</span>
            <span className="block text-xs text-muted-foreground">Baixe novamente ou gerencie exportações anteriores</span>
          </span>
        </Link>
        <Link
          href={Routes.EXPORTAR_BUDGETFLOW}
          data-testid="exportar-link-budgetflow"
          className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Send className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Enviar para BudgetFlow</span>
            <span className="block text-xs text-muted-foreground">Fluxo dedicado de envio de leads ao BudgetFlow</span>
          </span>
        </Link>
      </nav>

      <Suspense fallback={null}>
        <ExportPageContent />
      </Suspense>
    </div>
  )
}
