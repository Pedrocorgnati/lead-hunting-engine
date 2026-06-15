import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, CopyCheck, GitCompareArrows } from 'lucide-react'
import { getLeads } from '@/actions/leads'
import { Routes } from '@/lib/constants'
import { LeadsTable } from '@/components/leads/leads-table'
import { Input } from '@/components/ui/input'
import { LeadsPagination } from './_components/LeadsPagination'
import { SavedViewsBar } from '@/components/leads/SavedViewsBar'
import { BulkAddToCampaign } from '@/components/leads/BulkAddToCampaign'
import { LeadStatus, OpportunityType, LEAD_STATUS_MAP, OPPORTUNITY_TYPE_MAP, LEAD_TEMPERATURE_MAP, LeadTemperature } from '@/lib/constants/enums'

export const metadata: Metadata = {
  title: 'Leads',
}

interface PageProps {
  searchParams: Promise<{
    search?: string
    type?: string
    status?: string
    page?: string
    recency?: string
    // M12/G-001: filtros adicionais expostos na UI
    city?: string
    niche?: string
    temperature?: string
    scoreMin?: string
    scoreMax?: string
    // M12/G-002: ordenacao na UI
    sortBy?: string
    sortOrder?: string
    // outreach-engine (06-10): filtros de prontidao para envio
    hasEmail?: string
    noSite?: string
    ready?: string
  }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const recency = params.recency === '24h' ? '24h' : params.recency === '7d' ? '7d' : params.recency === '30d' ? '30d' : undefined
  const scoreMin = params.scoreMin ? Math.max(0, Math.min(100, parseInt(params.scoreMin) || 0)) : undefined
  const scoreMax = params.scoreMax ? Math.max(0, Math.min(100, parseInt(params.scoreMax) || 100)) : undefined
  const sortBy = params.sortBy ?? 'createdAt'
  const sortOrder: 'asc' | 'desc' = params.sortOrder === 'asc' ? 'asc' : 'desc'
  const { data: leads, total, pages, coverage } = await getLeads({
    page,
    search: params.search,
    type: params.type,
    status: params.status,
    city: params.city,
    niche: params.niche,
    temperature: params.temperature,
    scoreMin,
    scoreMax,
    sortBy,
    sortOrder,
    recency,
    hasEmail: params.hasEmail === '1',
    noSite: params.noSite === '1',
    ready: params.ready === '1',
  })

  // M12/G-001 + G-002: helper para preservar todos os filtros ao montar URLs (paginacao, recency pill)
  // M12-B4 round 2: usar scoreMin/scoreMax SANEADOS (Codex caught: scoreMin=999 cru vazava da URL para o export e era rejeitado em 422)
  const buildSearchParams = (overrides: Record<string, string | undefined>) => {
    const base: Record<string, string> = {}
    if (params.search) base.search = params.search
    if (params.type) base.type = params.type
    if (params.status) base.status = params.status
    if (params.city) base.city = params.city
    if (params.niche) base.niche = params.niche
    if (params.temperature) base.temperature = params.temperature
    if (scoreMin !== undefined) base.scoreMin = String(scoreMin)
    if (scoreMax !== undefined) base.scoreMax = String(scoreMax)
    if (params.recency) base.recency = params.recency
    if (params.sortBy) base.sortBy = params.sortBy
    if (params.sortOrder) base.sortOrder = params.sortOrder
    if (params.hasEmail) base.hasEmail = params.hasEmail
    if (params.noSite) base.noSite = params.noSite
    if (params.ready) base.ready = params.ready
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === '') delete base[k]
      else base[k] = v
    }
    return new URLSearchParams(base).toString()
  }

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
        <div className="flex items-center gap-2">
          <Link
            href={Routes.LEADS_DUPLICATAS}
            data-testid="leads-duplicatas-button"
            aria-label="Resolver duplicatas"
            className="flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          >
            <CopyCheck className="h-4 w-4" aria-hidden={true} />
            <span className="hidden sm:inline">Duplicatas</span>
          </Link>
          <Link
            href={Routes.LEADS_COMPARAR}
            data-testid="leads-comparar-button"
            aria-label="Comparar leads"
            className="flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden={true} />
            <span className="hidden sm:inline">Comparar</span>
          </Link>
          <Link
            href={(() => {
              // M12-B1: preserva filtros ativos ao navegar para /exportar
              const qs = buildSearchParams({ page: undefined })
              return qs ? `${Routes.EXPORTAR}?${qs}` : Routes.EXPORTAR
            })()}
            data-testid="leads-export-button"
            aria-label="Exportar leads"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px]"
          >
            <Download className="h-4 w-4" aria-hidden={true} />
            Exportar
          </Link>
        </div>
      </div>

      {/* Quick filter pills */}
      <div className="flex flex-wrap items-center gap-2" data-testid="leads-quick-filters">
        <Link
          href={`/leads?${buildSearchParams({ recency: params.recency === '24h' ? undefined : '24h', page: undefined })}`}
          data-testid="leads-filter-recency-24h"
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors min-h-[32px] ${params.recency === '24h' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}`}
          aria-current={params.recency === '24h' ? 'true' : undefined}
        >
          Novos 24h
        </Link>
        {/* outreach-engine (06-10): prontidão para envio */}
        <Link
          href={`/leads?${buildSearchParams({ noSite: params.noSite === '1' ? undefined : '1', page: undefined })}`}
          data-testid="leads-filter-no-site"
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors min-h-[32px] ${params.noSite === '1' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}`}
          aria-current={params.noSite === '1' ? 'true' : undefined}
        >
          Sem site
        </Link>
        <Link
          href={`/leads?${buildSearchParams({ hasEmail: params.hasEmail === '1' ? undefined : '1', page: undefined })}`}
          data-testid="leads-filter-has-email"
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors min-h-[32px] ${params.hasEmail === '1' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}`}
          aria-current={params.hasEmail === '1' ? 'true' : undefined}
        >
          Tem e-mail
        </Link>
        <Link
          href={`/leads?${buildSearchParams({ ready: params.ready === '1' ? undefined : '1', page: undefined })}`}
          data-testid="leads-filter-ready"
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors min-h-[32px] ${params.ready === '1' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}`}
          aria-current={params.ready === '1' ? 'true' : undefined}
        >
          Pronto p/ envio
        </Link>
      </div>

      {/* Filters bar */}
      <form method="GET" data-testid="leads-filters" className="flex flex-col sm:flex-row gap-3">
        {/* Preserve recency quando usuario aplica outros filtros */}
        {params.recency === '24h' && <input type="hidden" name="recency" value="24h" />}
        {/* Preserve pills de prontidao de outreach */}
        {params.noSite === '1' && <input type="hidden" name="noSite" value="1" />}
        {params.hasEmail === '1' && <input type="hidden" name="hasEmail" value="1" />}
        {params.ready === '1' && <input type="hidden" name="ready" value="1" />}
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

      {/* M12/G-001: 8 dimensoes — controles avancados (city, niche, temperature, score) e M12/G-002 sort */}
      <form method="GET" data-testid="leads-filters-advanced" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {params.search && <input type="hidden" name="search" value={params.search} />}
        {params.type && <input type="hidden" name="type" value={params.type} />}
        {params.status && <input type="hidden" name="status" value={params.status} />}
        {params.recency && <input type="hidden" name="recency" value={params.recency} />}
        {params.noSite === '1' && <input type="hidden" name="noSite" value="1" />}
        {params.hasEmail === '1' && <input type="hidden" name="hasEmail" value="1" />}
        {params.ready === '1' && <input type="hidden" name="ready" value="1" />}
        <Input
          type="text"
          name="city"
          defaultValue={params.city ?? ''}
          data-testid="leads-filter-city"
          placeholder="Cidade"
          className="min-h-[44px]"
          aria-label="Filtrar por cidade"
        />
        <Input
          type="text"
          name="niche"
          defaultValue={params.niche ?? ''}
          data-testid="leads-filter-niche"
          placeholder="Nicho/Categoria"
          className="min-h-[44px]"
          aria-label="Filtrar por nicho"
        />
        <select
          name="temperature"
          defaultValue={params.temperature ?? ''}
          data-testid="leads-filter-temperature"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          aria-label="Filtrar por temperatura"
        >
          <option value="">Todas as temperaturas</option>
          {Object.entries(LEAD_TEMPERATURE_MAP).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <Input
          type="number"
          name="scoreMin"
          min={0}
          max={100}
          defaultValue={params.scoreMin ?? ''}
          data-testid="leads-filter-score-min"
          placeholder="Score min"
          className="min-h-[44px]"
          aria-label="Score minimo (0-100)"
        />
        <Input
          type="number"
          name="scoreMax"
          min={0}
          max={100}
          defaultValue={params.scoreMax ?? ''}
          data-testid="leads-filter-score-max"
          placeholder="Score max"
          className="min-h-[44px]"
          aria-label="Score maximo (0-100)"
        />
        <select
          name="sortBy"
          defaultValue={sortBy}
          data-testid="leads-sort-by"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          aria-label="Ordenar por"
        >
          <option value="createdAt">Data de criacao</option>
          <option value="score">Score</option>
          <option value="businessName">Nome</option>
          <option value="temperature">Temperatura</option>
        </select>
        <select
          name="sortOrder"
          defaultValue={sortOrder}
          data-testid="leads-sort-order"
          className="h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          aria-label="Direcao da ordenacao"
        >
          <option value="desc">Descendente</option>
          <option value="asc">Ascendente</option>
        </select>
        <button
          type="submit"
          data-testid="leads-filters-apply"
          className="col-span-1 sm:col-span-2 lg:col-span-7 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          Aplicar filtros e ordenacao
        </button>
      </form>

      {/* TASK-16/ST004 intake-review (CL-267): visoes de filtros salvas */}
      <SavedViewsBar />

      {/* outreach-engine (3o passe UX): caminho de menor cliques para enviar em lote */}
      <BulkAddToCampaign />

      {/* Total count */}
      <p data-testid="leads-total-count" className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'lead encontrado' : 'leads encontrados'}
      </p>

      {/* M12/G-006: empty state ilustrativo + CTA quando 0 leads encontrados */}
      {total === 0 ? (
        <div
          data-testid="leads-empty-state"
          className="flex flex-col items-center justify-center text-center py-16 px-6 border border-dashed border-border rounded-lg bg-muted/20"
        >
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4" aria-hidden={true}>
            <Download className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Nenhum lead encontrado</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Ajuste os filtros acima ou inicie uma nova coleta para receber leads automaticamente.
          </p>
          <Link
            href={Routes.COLETAS}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            Iniciar uma coleta
          </Link>
        </div>
      ) : (
        <>
          {/* Cobertura de contato HONESTA do conjunto filtrado — o que dá pra
              agir agora. Negócio sem site raramente tem e-mail; telefone idem.
              Review 06-11 R1-2 (critério 19): WhatsApp confirmado (evidência
              de HTML) e provável (celular BR) NUNCA aparecem agregados sem
              qualificador. */}
          <div data-testid="leads-contact-coverage" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{total}</strong> leads</span>
            <span><strong className="text-foreground">{coverage.withPhone}</strong> com telefone</span>
            <span><strong className="text-foreground">{coverage.withWhatsappConfirmed}</strong> WhatsApp confirmado</span>
            <span><strong className="text-foreground">{coverage.withWhatsappProbable}</strong> WhatsApp provável (celular BR)</span>
            <span><strong className="text-foreground">{coverage.withEmail}</strong> com e-mail</span>
            {coverage.withPhone > 0 && (
              <Link href={Routes.ADMIN_OUTREACH} className="text-primary hover:underline">Trabalhar no Contato direto →</Link>
            )}
          </div>
          <LeadsTable leads={leads} />
          {/* Pagination — TASK-25/ST005 (CL-274): useTransition + skeleton inline. M12/G-001: preserva todos os filtros via buildSearchParams */}
          {pages > 1 && (
            <LeadsPagination
              page={page}
              pages={pages}
              baseQuery={buildSearchParams({})}
            />
          )}
        </>
      )}
    </div>
  )
}
