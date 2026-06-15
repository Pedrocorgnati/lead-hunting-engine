import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  MessageSquare,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Routes } from '@/lib/constants'
import { getDashboardStats, getRecentLeads, getUpcomingLeadReminders } from '@/actions/leads'
import { DashboardMetrics } from './_components/DashboardMetrics'

export const metadata: Metadata = {
  title: 'Dashboard',
}

const KPI_CARDS = [
  {
    label: 'Leads na base',
    icon: Users,
    dataKey: 'totalLeads',
    subLabel: 'total coletado',
  },
  {
    label: 'Novos',
    icon: Sparkles,
    dataKey: 'newLeads',
    subLabel: 'aguardando acao',
  },
  {
    label: 'Prontos',
    icon: Target,
    dataKey: 'readyLeads',
    subLabel: 'bons para trabalhar',
  },
  {
    label: 'Quentes',
    icon: TrendingUp,
    dataKey: 'hotLeads',
    subLabel: 'alta oportunidade',
  },
  {
    label: 'Buscas ativas',
    icon: Zap,
    dataKey: 'activeJobs',
    subLabel: 'rodando agora',
  },
]

export default async function DashboardPage() {
  const [stats, recentLeads, reminders] = await Promise.all([
    getDashboardStats(),
    getRecentLeads(),
    getUpcomingLeadReminders(),
  ])

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      <section
        data-testid="dashboard-page-header"
        className="rounded-lg border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Operacao principal
            </p>
            <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Busque leads, qualifique e entre em contato
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O caminho do sistema e simples: criar uma busca, trabalhar os melhores leads e iniciar o contato.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <Link
              href={Routes.COLETAS_NOVA}
              data-testid="dashboard-primary-new-search"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova busca de leads
            </Link>
            <Link
              href={`${Routes.LEADS}?ready=1&sortBy=score&sortOrder=desc`}
              data-testid="dashboard-primary-ready-leads"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Target className="h-4 w-4" aria-hidden="true" />
              Ver leads prontos
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="dashboard-actions-title" className="space-y-3">
        <div>
          <h2 id="dashboard-actions-title" className="text-base font-semibold text-foreground">
            O que fazer agora
          </h2>
          <p className="text-sm text-muted-foreground">
            Acoes diretas, sem precisar procurar no menu.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Link
            href={Routes.COLETAS_NOVA}
            data-testid="dashboard-action-create-search"
            className="group rounded-lg border border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Search className="h-5 w-5" aria-hidden="true" />
              </div>
              <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">Criar busca</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe nicho, cidade e limite. A coleta comeca imediatamente.
            </p>
          </Link>

          <Link
            href={`${Routes.LEADS}?sortBy=score&sortOrder=desc`}
            data-testid="dashboard-action-qualify-leads"
            className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">Qualificar leads</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra os melhores scores, resolva duplicatas e gere o pitch.
            </p>
          </Link>

          <Link
            href={`${Routes.LEADS}?ready=1&hasEmail=1&sortBy=score&sortOrder=desc`}
            data-testid="dashboard-action-contact-leads"
            className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">Entrar em contato</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Filtra leads prontos com contato para abrir pitch ou adicionar a campanha.
            </p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="dashboard-queue-title" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div data-testid="dashboard-work-queue" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-queue-title" className="text-base font-semibold text-foreground">
                Fila de leads para trabalhar
              </h2>
              <p className="text-sm text-muted-foreground">
                Leads recentes, com acesso direto ao pitch e contato.
              </p>
            </div>
            <Link
              href={`${Routes.LEADS}?sortBy=score&sortOrder=desc`}
              className="hidden text-sm font-medium text-primary transition-colors hover:text-primary/80 sm:inline-flex"
            >
              Abrir lista
            </Link>
          </div>

          <div data-testid="dashboard-recent-leads-list" className="overflow-hidden rounded-lg border bg-card">
            {recentLeads.length === 0 ? (
              <div data-testid="dashboard-recent-leads-empty" className="p-6">
                <p className="text-sm font-medium text-foreground">Nenhum lead coletado ainda.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Comece criando uma busca por nicho e cidade.
                </p>
                <Link
                  href={Routes.COLETAS_NOVA}
                  data-testid="dashboard-start-coleta-link"
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Iniciar primeira busca
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    data-testid={`dashboard-recent-lead-${lead.id}`}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={Routes.LEAD_DETAIL(lead.id)}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {lead.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[lead.niche ?? lead.category, lead.city].filter(Boolean).join(' · ') || 'Sem segmento informado'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded border px-1.5 py-0.5">Score {lead.score}</span>
                        <span className="rounded border px-1.5 py-0.5">{lead.temperature}</span>
                        {lead.phone || lead.email ? (
                          <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                            <PhoneCall className="h-3 w-3" aria-hidden="true" />
                            Tem contato
                          </span>
                        ) : (
                          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">Sem contato direto</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`${Routes.LEAD_DETAIL(lead.id)}?tab=pitch`}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-accent"
                      >
                        Pitch
                      </Link>
                      <Link
                        href={Routes.LEAD_DETAIL(lead.id)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Abrir
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Resumo operacional</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Prontos para contato</dt>
                <dd className="font-semibold text-foreground">{stats.readyLeads}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Com telefone/e-mail</dt>
                <dd className="font-semibold text-foreground">{stats.contactableLeads}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Leads quentes</dt>
                <dd className="font-semibold text-foreground">{stats.hotLeads}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Conversao</dt>
                <dd className="font-semibold text-foreground">{stats.conversionRate}</dd>
              </div>
            </dl>
          </div>

          {reminders.length > 0 && (
            <div data-testid="dashboard-upcoming-reminders" className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Lembretes</h2>
                <Link href={Routes.LEADS} className="text-xs text-primary hover:text-primary/80">
                  Ver leads
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {reminders.map((reminder) => (
                  <Link
                    key={`${reminder.leadId}:${reminder.taskId}`}
                    href={`${Routes.LEAD_DETAIL(reminder.leadId)}?tab=notas`}
                    className="block rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <p className="truncate text-sm font-medium text-foreground">{reminder.title}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{reminder.leadName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {new Date(reminder.dueAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section aria-labelledby="dashboard-kpis-title" className="space-y-3">
        <div>
          <h2 id="dashboard-kpis-title" className="text-base font-semibold text-foreground">
            Indicadores rapidos
          </h2>
          <p className="text-sm text-muted-foreground">
            Use como leitura de saude, nao como ponto de partida.
          </p>
        </div>

        <div data-testid="dashboard-kpi-grid" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPI_CARDS.map((card) => {
            const Icon = card.icon
            const value = stats[card.dataKey as keyof typeof stats]
            return (
              <div
                key={card.label}
                data-testid={`dashboard-kpi-card-${card.dataKey}`}
                className="rounded-lg border bg-card p-4"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden={true} />
                  <span className="text-sm">{card.label}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{card.subLabel}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="dashboard-support-metrics-title" className="space-y-3">
        <h2 id="dashboard-support-metrics-title" className="text-base font-semibold text-foreground">
          Metricas de apoio
        </h2>
        <DashboardMetrics />
      </section>
    </div>
  )
}
