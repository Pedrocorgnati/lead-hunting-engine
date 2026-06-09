import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Database, AlertCircle, CheckCircle2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getJob, getJobLeads, getJobLogs } from '@/actions/jobs'
import { Routes } from '@/lib/constants'
import { COLLECTION_JOB_STATUS_MAP } from '@/lib/constants/enums'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { JobCostBadge } from '@/components/jobs/JobCostBadge'
import { ProviderHealthBadge } from '@/components/ProviderHealthBadge'
import { RetryButton } from './_components/RetryButton'
import { CancelButton } from './_components/CancelButton'
import { ResumeButton } from './_components/ResumeButton'
import { ExportPartialButton } from './_components/ExportPartialButton'
import { CopyButton } from './_components/CopyButton'
import { LiveProgressPanel } from './_components/LiveProgressPanel'

export const metadata: Metadata = { title: 'Detalhe da Coleta' }

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string>>
}

type TabKey = 'leads' | 'logs' | 'falhas' | 'parametros'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'leads', label: 'Leads' },
  { key: 'logs', label: 'Logs' },
  { key: 'falhas', label: 'Falhas' },
  { key: 'parametros', label: 'Parametros' },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type JobExtra = {
  sources?: string[]
  startedAt?: string | null
  completedAt?: string | null
  triggerId?: string | null
}

export default async function CollectionDetailPage({ params, searchParams }: CollectionDetailPageProps) {
  const { id } = await params
  const sp = await searchParams
  const activeTab: TabKey = (sp?.tab as TabKey) ?? 'leads'
  const job = await getJob(id)

  if (!job) notFound()

  const [leads, logs] = await Promise.all([
    getJobLeads(id),
    getJobLogs(id),
  ])

  const jobExtra = job as typeof job & JobExtra
  const statusInfo = COLLECTION_JOB_STATUS_MAP[job.status]

  return (
    <div data-testid="collection-detail-page" className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={Routes.COLETAS}
        data-testid="collection-detail-back-button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para Coletas
      </Link>

      {/* Header */}
      <div data-testid="collection-detail-header" className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{job.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {job.location}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CancelButton jobId={job.id} status={job.status} />
          <ResumeButton jobId={job.id} status={job.status} />
          <RetryButton jobId={job.id} status={job.status} />
          <ExportPartialButton jobId={job.id} leadsCount={leads.length} />
          <JobCostBadge jobId={job.id} status={job.status} />
          <Badge variant={statusInfo?.variant ?? 'secondary'} data-testid="collection-detail-status" aria-live="polite" aria-atomic="true">
            {statusInfo?.label ?? job.status}
          </Badge>
        </div>
      </div>

      {/* Progresso + Mini-timeline (live) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progresso</CardTitle>
        </CardHeader>
        <CardContent>
          <LiveProgressPanel
            jobId={job.id}
            initialStatus={job.status}
            initialProgress={job.progress}
            initialResultCount={job.resultCount}
            initialMaxResults={job.maxResults}
            initialUpdatedAt={job.updatedAt}
            initialErrorMessage={job.errorMessage}
            initialStartedAt={jobExtra.startedAt ?? null}
            initialCompletedAt={jobExtra.completedAt ?? null}
          />
          {jobExtra.sources && jobExtra.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-4">
              <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Fontes:</span>
              {jobExtra.sources.map((source) => (
                <span key={source} className="flex items-center gap-1">
                  <span className="font-medium text-foreground">{source}</span>
                  <ProviderHealthBadge provider={source} />
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab navigation */}
      <nav aria-label="Abas da coleta" className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`${Routes.COLLECTION_DETAIL(id)}?tab=${tab.key}`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Tab: leads */}
      {activeTab === 'leads' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Leads coletados ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <EmptyState
                icon={Database}
                title="Nenhum lead coletado ainda"
                description="Os leads aparecerão aqui conforme a coleta avança."
              />
            ) : (
              <div className="space-y-2">
                {leads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={Routes.LEAD_DETAIL(lead.id)}
                    data-testid={`collection-lead-${lead.id}`}
                    className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors min-h-[44px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[lead.category, lead.city].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant="outline" className="text-xs">
                        Score: {lead.score}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: logs — consome GET /api/v1/collections/:id/logs via server action */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Logs da coleta</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nenhum log registrado"
                description="Logs de eventos e erros internos da coleta aparecerão aqui."
              />
            ) : (
              <ul className="space-y-2 text-sm" aria-label="Entradas de log">
                {logs.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-2 rounded-md border p-3 bg-muted/30"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">{formatDate(entry.createdAt)}</p>
                      <span className="text-xs font-medium mr-2">[{entry.action}]</span>
                      {entry.ipAddress && (
                        <span className="text-xs text-muted-foreground mr-2">IP: {entry.ipAddress}</span>
                      )}
                      {entry.metadata != null && (
                        <span className="break-words text-xs">
                          {typeof entry.metadata === 'string'
                            ? entry.metadata
                            : JSON.stringify(entry.metadata)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: falhas */}
      {activeTab === 'falhas' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erros e falhas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.errorMessage ? (
              <>
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{job.errorMessage}</span>
                </div>
                <Link
                  href={`${Routes.COLLECTION_DETAIL(id)}/erros`}
                  className="text-sm underline text-muted-foreground hover:text-foreground"
                >
                  Ver e gerir todos os erros
                </Link>
              </>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhuma falha registrada"
                description="Quando ocorrerem erros nesta coleta eles aparecerão aqui."
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: parametros */}
      {activeTab === 'parametros' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parametros da coleta</CardTitle>
          </CardHeader>
          <CardContent>
            {!job.query && !job.location ? (
              <EmptyState
                icon={Database}
                title="Nenhum parâmetro disponível"
                description="Os parâmetros desta coleta não estão disponíveis."
              />
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">ID da coleta</dt>
                  <dd className="flex items-center gap-1 font-mono text-xs break-all">
                    {id}
                    <CopyButton value={id} label="ID da coleta" />
                  </dd>
                </div>
                {jobExtra.triggerId && (
                  <div>
                    <dt className="text-muted-foreground">Correlation ID</dt>
                    <dd className="flex items-center gap-1 font-mono text-xs break-all">
                      {jobExtra.triggerId}
                      <CopyButton value={jobExtra.triggerId} label="Correlation ID" />
                    </dd>
                  </div>
                )}
                <div><dt className="text-muted-foreground">Nicho</dt><dd>{job.query}</dd></div>
                <div><dt className="text-muted-foreground">Localizacao</dt><dd>{job.location}</dd></div>
                <div><dt className="text-muted-foreground">Maximo</dt><dd>{job.maxResults} resultados</dd></div>
                <div><dt className="text-muted-foreground">Status</dt><dd>{statusInfo?.label ?? job.status}</dd></div>
                <div><dt className="text-muted-foreground">Progresso</dt><dd>{job.progress}%</dd></div>
              </dl>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
