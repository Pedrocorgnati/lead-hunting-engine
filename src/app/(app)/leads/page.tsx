import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { getLeads } from '@/actions/leads'
import { Routes } from '@/lib/constants'
import { LeadsTable } from '@/components/leads/leads-table'
import { Input } from '@/components/ui/input'
import { LeadsPagination } from './_components/LeadsPagination'
import { SavedViewsBar } from '@/components/leads/SavedViewsBar'
import { LeadStatus, OpportunityType, LEAD_STATUS_MAP, OPPORTUNITY_TYPE_MAP } from '@/lib/constants/enums'

export const metadata: Metadata = {
  title: 'Leads',
}

interface PageProps {
  searchParams: Promise<{ search?: string; type?: string; status?: string; page?: string; recency?: string }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const recency = params.recency === '24h' ? '24h' : undefined
  const { data: leads, total, pages } = await getLeads({
    page,
    search: params.search,
    type: params.type,
    status: params.status,
    recency,
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

      {/* Quick filter pills */}
      <div className="flex items-center gap-2" data-testid="leads-quick-filters">
        <Link
          href={params.recency === '24h'
            ? `/leads?${new URLSearchParams({ ...(params.search ? { search: params.search } : {}), ...(params.type ? { type: params.type } : {}), ...(params.status ? { status: params.status } : {}) }).toString()}`
            : `/leads?${new URLSearchParams({ ...(params.search ? { search: params.search } : {}), ...(params.type ? { type: params.type } : {}), ...(params.status ? { status: params.status } : {}), recency: '24h' }).toString()}`}
          data-testid="leads-filter-recency-24h"
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors min-h-[32px] ${params.recency === '24h' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}`}
          aria-pressed={params.recency === '24h'}
        >
          Novos 24h
        </Link>
      </div>

      {/* Filters bar */}
      <form method="GET" data-testid="leads-filters" className="flex flex-col sm:flex-row gap-3">
        {/* Preserve recency quando usuario aplica outros filtros */}
        {params.recency === '24h' && <input type="hidden" name="recency" value="24h" />}
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

      {/* TASK-16/ST004 intake-review (CL-267): visoes de filtros salvas */}
      <SavedViewsBar />

      {/* Total count */}
      <p data-testid="leads-total-count" className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'lead encontrado' : 'leads encontrados'}
      </p>

      {/* Table */}
      <LeadsTable leads={leads} />

      {/* Pagination — TASK-25/ST005 (CL-274): useTransition + skeleton inline */}
      {pages > 1 && (
        <LeadsPagination
          page={page}
          pages={pages}
          buildHref={(nextPage) =>
            `/leads?${new URLSearchParams({
              ...(params.search ? { search: params.search } : {}),
              ...(params.type ? { type: params.type } : {}),
              ...(params.status ? { status: params.status } : {}),
              ...(params.recency ? { recency: params.recency } : {}),
              page: String(nextPage),
            }).toString()}`
          }
        />
      )}
    </div>
  )
}
