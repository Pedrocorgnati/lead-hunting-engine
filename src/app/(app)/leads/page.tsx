import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { getLeads } from '@/actions/leads'
import { Routes } from '@/lib/constants/routes'
import { LeadsTable } from '@/components/leads/leads-table'

export const metadata: Metadata = {
  title: 'Leads',
}

export default async function LeadsPage() {
  const { data: leads, total } = await getLeads()

  return (
    <div data-testid="leads-page" className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e analise seus leads coletados
          </p>
        </div>
        <Link
          href={Routes.EXPORTAR}
          data-testid="leads-export-button"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" aria-hidden={true} />
          Exportar
        </Link>
      </div>

      {/* Filters bar */}
      <div data-testid="leads-filters" className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          data-testid="leads-search-input"
          placeholder="Buscar por nome, cidade..."
          className="flex-1 h-10 px-3 py-2 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
          aria-label="Buscar leads"
        />
        <select
          data-testid="leads-filter-type"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          <option value="A">Tipo A</option>
          <option value="B">Tipo B</option>
          <option value="C">Tipo C</option>
        </select>
        <select
          data-testid="leads-filter-status"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          <option value="NEW">Novo</option>
          <option value="CONTACTED">Contatado</option>
          <option value="QUALIFIED">Qualificado</option>
          <option value="CONVERTED">Convertido</option>
        </select>
      </div>

      {/* Total count */}
      <p data-testid="leads-total-count" className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'lead encontrado' : 'leads encontrados'}
      </p>

      {/* Table */}
      <LeadsTable leads={leads} />
    </div>
  )
}
