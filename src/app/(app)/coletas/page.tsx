'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, Zap, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal, ConfirmationDialog } from '@/components/ui/modal'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils/format'
import { Limits } from '@/lib/constants/limits'
import { Routes } from '@/lib/constants'
import { getJobs, createJob, getJobStatus, cancelJob } from '@/actions/jobs'
import type { CollectionJobSummary } from '@/lib/types/entities'
import { JobStatus, JOB_STATUS_MAP } from '@/lib/constants/enums'

const createJobSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.').max(100),
  query: z.string().min(2, 'Busca deve ter pelo menos 2 caracteres.').max(200),
  location: z.string().min(2, 'Localização deve ter pelo menos 2 caracteres.').max(200),
  radiusMeters: z.number().min(500).max(50000),
  maxResults: z.number().min(1).max(Limits.MAX_COLLECTION_SIZE),
})

type CreateJobFormData = z.infer<typeof createJobSchema>

// ─── Badge variant por status ───────────────────────────
function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case JobStatus.FAILED: return 'destructive'
    case JobStatus.CANCELLED: return 'outline'
    case JobStatus.COMPLETED: return 'secondary'
    case JobStatus.PENDING: return 'secondary'
    case JobStatus.PAUSED: return 'secondary'
    case JobStatus.PARTIAL: return 'outline'
    default: return 'default'
  }
}

function getStatusBadgeClassName(status: string): string {
  if (status === JobStatus.COMPLETED) return 'bg-success text-success-foreground hover:bg-success/90'
  if (status === JobStatus.PENDING) return 'bg-muted text-muted-foreground'
  return ''
}

// ─── JobCard ────────────────────────────────────────────
function JobCard({
  job,
  onStatusUpdate,
  onCancelRequest,
}: {
  job: CollectionJobSummary
  onStatusUpdate: (id: string, update: Partial<CollectionJobSummary>) => void
  onCancelRequest: (id: string) => void
}) {
  const toast = useToast()
  const statusInfo = JOB_STATUS_MAP[job.status]
  const isActive = job.status === JobStatus.RUNNING || job.status === JobStatus.PENDING
  const showProgress = job.status === JobStatus.RUNNING || job.status === JobStatus.COMPLETED
  const isCancellable = job.status === JobStatus.PENDING || job.status === JobStatus.RUNNING
  const prevStatusRef = useRef(job.status)

  // Detectar transição para status terminal e emitir toast
  useEffect(() => {
    if (prevStatusRef.current !== job.status) {
      if (job.status === JobStatus.COMPLETED && prevStatusRef.current !== JobStatus.COMPLETED) {
        toast.success(`Coleta "${job.name}" concluída! ${job.resultCount} leads coletados.`)
      }
      if (job.status === JobStatus.FAILED && prevStatusRef.current !== JobStatus.FAILED) {
        toast.error(`Coleta "${job.name}" falhou.`)
      }
      prevStatusRef.current = job.status
    }
  }, [job.status, job.name, job.resultCount, toast])

  // Polling para jobs ativos
  useEffect(() => {
    if (!isActive) return
    let count = 0
    const interval = setInterval(async () => {
      count++
      if (count > 180) { clearInterval(interval); return }
      try {
        const update = await getJobStatus(job.id)
        if (update) {
          onStatusUpdate(job.id, update)
          if (([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] as string[]).includes(update.status)) {
            clearInterval(interval)
          }
        }
      } catch { clearInterval(interval) }
    }, Limits.POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [job.id, isActive, onStatusUpdate])

  const progressPct = job.maxResults > 0 ? Math.round((job.resultCount / job.maxResults) * 100) : 0

  return (
    <div data-testid={`coletas-job-card-${job.id}`} className="rounded-lg border bg-card p-4 space-y-3" role="listitem">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={Routes.COLLECTION_DETAIL(job.id)} className="text-sm font-medium text-foreground truncate hover:underline">{job.name}</Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCancellable && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onCancelRequest(job.id)}
              aria-label={`Cancelar coleta ${job.name}`}
              data-testid={`coletas-cancel-${job.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Badge
            variant={getStatusBadgeVariant(job.status)}
            className={getStatusBadgeClassName(job.status)}
          >
            {statusInfo?.label ?? job.status}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {job.query} {'\u2022'} {job.location} {'\u2022'} {formatDate(job.createdAt)}
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{statusInfo?.label ?? job.status}</span>
        <span className="text-foreground font-mono">
          {job.resultCount} leads{job.status === JobStatus.RUNNING ? ` (${progressPct}%)` : ''}
        </span>
      </div>

      {/* Barra de progresso */}
      {showProgress && (
        <div
          className="h-1.5 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso da coleta: ${progressPct}%`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              job.status === JobStatus.RUNNING ? 'bg-info animate-pulse' : 'bg-success'
            )}
            style={{ width: `${job.status === JobStatus.COMPLETED ? 100 : Math.max(3, progressPct)}%` }}
          />
        </div>
      )}

      {/* Mensagem de erro para jobs FAILED */}
      {job.status === JobStatus.FAILED && job.errorMessage && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-destructive">{job.errorMessage}</p>
        </div>
      )}
    </div>
  )
}

// ─── CollectionForm ─────────────────────────────────────
function CollectionForm({ onSuccess, onCancel }: { onSuccess: (job: CollectionJobSummary) => void; onCancel: () => void }) {
  const toast = useToast()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateJobFormData>({
    resolver: zodResolver(createJobSchema),
    defaultValues: { radiusMeters: 5000, maxResults: 100 },
  })

  const onSubmit = async (data: CreateJobFormData) => {
    try {
      const result = await createJob(data)
      toast.success('Coleta iniciada! Acompanhe o progresso na lista.')
      onSuccess({
        id: result.id,
        name: data.name,
        query: data.query,
        location: data.location,
        status: JobStatus.PENDING,
        progress: 0,
        resultCount: 0,
        maxResults: data.maxResults,
        createdAt: new Date().toISOString(),
      })
    } catch {
      toast.error('Erro ao criar coleta. Verifique os dados e tente novamente.')
    }
  }

  return (
    <form data-testid="coletas-modal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome da coleta <span aria-hidden="true">*</span></Label>
        <Input
          id="name"
          data-testid="coletas-form-name-input"
          placeholder="Ex: Restaurantes SP - Centro"
          disabled={isSubmitting}
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="query">O que buscar <span aria-hidden="true">*</span></Label>
        <Input
          id="query"
          data-testid="coletas-form-query-input"
          placeholder="Ex: restaurante japonês"
          disabled={isSubmitting}
          aria-required="true"
          aria-invalid={!!errors.query}
          aria-describedby={errors.query ? 'query-error' : undefined}
          {...register('query')}
        />
        {errors.query && (
          <p id="query-error" role="alert" className="text-xs text-destructive">{errors.query.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Localização <span aria-hidden="true">*</span></Label>
        <Input
          id="location"
          data-testid="coletas-form-location-input"
          placeholder="Ex: São Paulo, SP"
          disabled={isSubmitting}
          aria-required="true"
          aria-invalid={!!errors.location}
          aria-describedby={errors.location ? 'location-error' : undefined}
          {...register('location')}
        />
        {errors.location && (
          <p id="location-error" role="alert" className="text-xs text-destructive">{errors.location.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="radiusMeters">Raio (metros)</Label>
          <Input
            id="radiusMeters"
            type="number"
            disabled={isSubmitting}
            aria-invalid={!!errors.radiusMeters}
            {...register('radiusMeters', { valueAsNumber: true })}
          />
          {errors.radiusMeters && (
            <p role="alert" className="text-xs text-destructive">{errors.radiusMeters.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxResults">Máx. resultados</Label>
          <Input
            id="maxResults"
            type="number"
            disabled={isSubmitting}
            aria-invalid={!!errors.maxResults}
            {...register('maxResults', { valueAsNumber: true })}
          />
          {errors.maxResults && (
            <p role="alert" className="text-xs text-destructive">{errors.maxResults.message}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          data-testid="coletas-form-cancel-button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          data-testid="coletas-form-submit-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting && (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-label="Carregando..." />
          )}
          {isSubmitting ? 'Iniciando...' : 'Iniciar coleta'}
        </Button>
      </div>
    </form>
  )
}

// ─── ColetasPage ────────────────────────────────────────
export default function ColetasPage() {
  const toast = useToast()
  const [jobs, setJobs] = useState<CollectionJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch(() => {
        setError(true)
        toast.error('Erro ao carregar coletas. Tente novamente.')
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStatusUpdate = useCallback((id: string, update: Partial<CollectionJobSummary>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...update } : j))
  }, [])

  const handleNewJob = (job: CollectionJobSummary) => {
    setJobs(prev => [job, ...prev])
    setCreateOpen(false)
  }

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelJob(cancelTarget)
      setJobs(prev => prev.map(j =>
        j.id === cancelTarget
          ? { ...j, status: JobStatus.CANCELLED, errorMessage: 'Cancelado pelo usuário.' }
          : j
      ))
      toast.success('Coleta cancelada.')
    } catch {
      toast.error('Erro ao cancelar coleta.')
    } finally {
      setCancelling(false)
      setCancelTarget(null)
    }
  }

  return (
    <main data-testid="coletas-page" className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Coletas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico e progresso das suas coletas de leads
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="coletas-create-button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova coleta
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando coletas">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/30 p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mb-4" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground mb-1">Erro ao carregar coletas.</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true)
              setError(false)
              getJobs()
                .then(setJobs)
                .catch(() => { setError(true); toast.error('Erro ao carregar coletas.') })
                .finally(() => setLoading(false))
            }}
            className="mt-2"
          >
            Tentar novamente
          </Button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Zap className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma coleta realizada ainda.</p>
          <Button
            variant="link"
            data-testid="coletas-empty-create-button"
            onClick={() => setCreateOpen(true)}
            className="mt-2"
          >
            Criar primeira coleta
          </Button>
        </div>
      ) : (
        <div data-testid="coletas-list" className="space-y-3" role="list" aria-label="Lista de coletas">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onStatusUpdate={handleStatusUpdate}
              onCancelRequest={setCancelTarget}
            />
          ))}
        </div>
      )}

      {/* Modal: Nova coleta */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nova coleta">
        <CollectionForm
          onSuccess={handleNewJob}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Dialog: Confirmar cancelamento */}
      <ConfirmationDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
        title="Cancelar coleta"
        description="Tem certeza que deseja cancelar esta coleta? Esta ação não pode ser desfeita."
        confirmLabel="Cancelar coleta"
        cancelLabel="Voltar"
        variant="destructive"
        loading={cancelling}
      />
    </main>
  )
}
