import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Search, MapPin, Clock, Database, AlertCircle } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getJob, getJobLeads } from '@/actions/jobs'
import { Routes } from '@/lib/constants'
import { COLLECTION_JOB_STATUS_MAP } from '@/lib/constants/enums'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { JobCostBadge } from '@/components/jobs/JobCostBadge'

export const metadata: Metadata = { title: 'Detalhe da Coleta' }

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>
}

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

export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const { id } = await params
  const job = await getJob(id)

  if (!job) notFound()

  const leads = await getJobLeads(id)
  const jobExtra = job as typeof job & { sources?: string[]; startedAt?: string | null; completedAt?: string | null }
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
              <Search className="h-4 w-4" aria-hidden="true" />
              {job.query}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {job.location}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <JobCostBadge jobId={job.id} status={job.status} />
          <Badge variant={statusInfo?.variant ?? 'secondary'} data-testid="collection-detail-status">
            {statusInfo?.label ?? job.status}
          </Badge>
        </div>
      </div>

      {/* Progress & Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progresso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Leads coletados</span>
              <span className="font-medium">{job.resultCount} / {job.maxResults}</span>
            </div>
            <Progress value={job.progress} className="h-2" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Criado em</p>
              <p className="font-medium">{formatDate(job.createdAt)}</p>
            </div>
            {jobExtra.startedAt && (
              <div>
                <p className="text-muted-foreground">Iniciado em</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {formatDate(jobExtra.startedAt)}
                </p>
              </div>
            )}
            {jobExtra.completedAt && (
              <div>
                <p className="text-muted-foreground">Finalizado em</p>
                <p className="font-medium">{formatDate(jobExtra.completedAt)}</p>
              </div>
            )}
            {jobExtra.sources && jobExtra.sources.length > 0 && (
              <div>
                <p className="text-muted-foreground">Fontes</p>
                <p className="font-medium flex items-center gap-1">
                  <Database className="h-3 w-3" aria-hidden="true" />
                  {jobExtra.sources.join(', ')}
                </p>
              </div>
            )}
          </div>

          {job.errorMessage && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{job.errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leads list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Leads coletados ({leads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <EmptyState
              icon={Search}
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
    </div>
  )
}
