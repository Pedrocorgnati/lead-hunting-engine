import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, Target, TrendingUp, Zap } from 'lucide-react'
import { Routes } from '@/lib/constants/routes'
import { getDashboardStats, getRecentLeads } from '@/actions/leads'

export const metadata: Metadata = {
  title: 'Dashboard',
}

const KPI_CARDS = [
  {
    label: 'Total de Leads',
    icon: Users,
    dataKey: 'totalLeads',
    subLabel: 'leads coletados',
  },
  {
    label: 'Alta Oportunidade',
    icon: Target,
    dataKey: 'highOpportunity',
    subLabel: '+ médias oportunidades',
  },
  {
    label: 'Taxa de Conversão',
    icon: TrendingUp,
    dataKey: 'conversionRate',
    subLabel: 'convertidos',
  },
  {
    label: 'Coletas Ativas',
    icon: Zap,
    dataKey: 'activeJobs',
    subLabel: 'em andamento',
  },
]

export default async function DashboardPage() {
  const [stats, recentLeads] = await Promise.all([
    getDashboardStats(),
    getRecentLeads(),
  ])

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* Page header */}
      <div data-testid="dashboard-page-header">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral dos seus leads e coletas
        </p>
      </div>

      {/* KPI Cards */}
      <div data-testid="dashboard-kpi-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => {
          const Icon = card.icon
          const value = stats[card.dataKey as keyof typeof stats]
          return (
            <div
              key={card.label}
              data-testid={`dashboard-kpi-card-${card.dataKey}`}
              className="rounded-lg border bg-card p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden={true} />
                <span className="text-sm">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{card.subLabel}</p>
            </div>
          )
        })}
      </div>

      {/* Recent leads */}
      <div data-testid="dashboard-recent-leads" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Leads recentes</h2>
          <Link
            href={Routes.LEADS}
            data-testid="dashboard-see-all-leads-link"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Ver todos →
          </Link>
        </div>

        <div data-testid="dashboard-recent-leads-list" className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
          {recentLeads.length === 0 ? (
            <div data-testid="dashboard-recent-leads-empty" className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhum lead coletado ainda.</p>
              <Link
                href={Routes.COLETAS}
                data-testid="dashboard-start-coleta-link"
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                Iniciar primeira coleta
              </Link>
            </div>
          ) : (
            recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={Routes.LEAD_DETAIL(lead.id)}
                data-testid={`dashboard-recent-lead-${lead.id}`}
                className="flex items-center justify-between p-3 hover:bg-accent transition-colors min-h-[44px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.city}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs border border-border rounded px-1.5 py-0.5">
                    Tipo {lead.type}
                  </span>
                  <span className="text-sm font-mono text-foreground">{lead.score}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
