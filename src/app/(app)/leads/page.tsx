import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { getLeads } from '@/actions/leads'
import { Routes } from '@/lib/constants'
import { LeadsTable } from '@/components/leads/leads-table'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LeadStatus, OpportunityType, LEAD_STATUS_MAP, OPPORTUNITY_TYPE_MAP } from '@/lib/constants/enums'

export const metadata: Metadata = {
  title: 'Leads',
}

interface PageProps {
  searchParams: Promise<{ search?: string; type?: string; status?: string; page?: string }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const { data: leads, total, pages } = await getLeads({
    page,
    search: params.search,
    type: params.type,
    status: params.status,
  })

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
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px]"
        >
          <Download className="h-4 w-4" aria-hidden={true} />
          Exportar
        </Link>
      </div>

      {/* Filters bar */}
      <form method="GET" data-testid="leads-filters" className="flex flex-col sm:flex-row gap-3">
        <Input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          data-testid="leads-search-input"
          placeholder="Buscar por nome, cidade..."
          className="flex-1 min-h-[44px]"
          aria-label="Buscar leads"
        />
        <select
          name="type"
          defaultValue={params.type ?? ''}
          data-testid="leads-filter-type"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(OPPORTUNITY_TYPE_MAP).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ''}
          data-testid="leads-filter-status"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {Object.entries(LEAD_STATUS_MAP).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="submit" className="sr-only">Filtrar</button>
      </form>

      {/* Total count */}
      <p data-testid="leads-total-count" className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'lead encontrado' : 'leads encontrados'}
      </p>

      {/* Table */}
      <LeadsTable leads={leads} />

      {/* Pagination */}
      {pages > 1 && (
        <nav className="flex items-center justify-between py-4" aria-label="Paginação">
          <p className="text-sm text-muted-foreground">
            Página {page} de {pages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/leads?${new URLSearchParams({ ...(params.search ? { search: params.search } : {}), ...(params.type ? { type: params.type } : {}), ...(params.status ? { status: params.status } : {}), page: String(page - 1) }).toString()}`}
                className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm hover:bg-accent transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm opacity-50 cursor-not-allowed">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            <span className="flex items-center text-sm px-3">{page} / {pages}</span>
            {page < pages ? (
              <Link
                href={`/leads?${new URLSearchParams({ ...(params.search ? { search: params.search } : {}), ...(params.type ? { type: params.type } : {}), ...(params.status ? { status: params.status } : {}), page: String(page + 1) }).toString()}`}
                className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm hover:bg-accent transition-colors"
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm opacity-50 cursor-not-allowed">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
