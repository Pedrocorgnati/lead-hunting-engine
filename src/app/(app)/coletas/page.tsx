'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Zap } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getJobs, createJob, getJobStatus } from '@/actions/jobs'
import type { CollectionJobSummary } from '@/actions/jobs'
import { JobStatus, JOB_STATUS_MAP } from '@/lib/constants/enums'

const createJobSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.').max(100),
  query: z.string().min(2, 'Busca deve ter pelo menos 2 caracteres.').max(200),
  location: z.string().min(2, 'Localização deve ter pelo menos 2 caracteres.').max(200),
  radiusMeters: z.number().min(500).max(50000),
  maxResults: z.number().min(1).max(500),
})

type CreateJobFormData = z.infer<typeof createJobSchema>

function JobCard({ job, onStatusUpdate }: { job: CollectionJobSummary; onStatusUpdate: (id: string, update: Partial<CollectionJobSummary>) => void }) {
  const statusInfo = JOB_STATUS_MAP[job.status]
  const isActive = job.status === JobStatus.RUNNING || job.status === JobStatus.PENDING
  const showProgress = job.status === JobStatus.RUNNING || job.status === JobStatus.COMPLETED

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
          if ([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(update.status)) {
            clearInterval(interval)
          }
        }
      } catch { clearInterval(interval) }
    }, 5000)
    return () => clearInterval(interval)
  }, [job.id, isActive, onStatusUpdate])

  const progressPct = job.maxResults > 0 ? Math.round((job.resultCount / job.maxResults) * 100) : 0

  return (
    <div data-testid={`coletas-job-card-${job.id}`} className="rounded-lg border bg-card p-4 space-y-3" role="listitem">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{job.name}</p>
        <Badge
          variant={
            job.status === JobStatus.FAILED ? 'destructive' :
            job.status === JobStatus.CANCELLED ? 'outline' : 'default'
          }
          className={
            job.status === JobStatus.COMPLETED ? 'bg-green-600 text-white hover:bg-green-700' :
            job.status === JobStatus.PENDING ? 'bg-muted text-muted-foreground' : ''
          }
        >
          {statusInfo.label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {job.query} • {job.location} • {new Date(job.createdAt).toLocaleDateString('pt-BR')}
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{statusInfo.label}</span>
        <span className="text-foreground font-mono">
          {job.resultCount} leads{job.status === JobStatus.RUNNING ? ` (${progressPct}%)` : ''}
        </span>
      </div>
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
            className={`h-full rounded-full transition-all duration-500 ${
              job.status === JobStatus.RUNNING
                ? 'bg-blue-500 animate-pulse'
                : 'bg-green-500'
            }`}
            style={{ width: `${job.status === JobStatus.COMPLETED ? 100 : progressPct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function CollectionForm({ onSuccess, onCancel }: { onSuccess: (job: CollectionJobSummary) => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateJobFormData>({
    resolver: zodResolver(createJobSchema),
    defaultValues: { radiusMeters: 5000, maxResults: 100 },
  })

  const onSubmit = async (data: CreateJobFormData) => {
    try {
      await createJob(data)
      toast.success('Coleta iniciada! Acompanhe o progresso na lista.')
      onSuccess({
        id: crypto.randomUUID(),
        name: data.name,
        query: data.query,
        location: data.location,
        status: JobStatus.PENDING,
        progress: 0,
        resultCount: 0,
        maxResults: data.maxResults,
        radiusMeters: data.radiusMeters,
        createdAt: new Date().toISOString(),
      })
    } catch {
      toast.error('Erro ao criar coleta. Verifique os dados e tente novamente.')
    }
  }

  return (
    <form data-testid="coletas-modal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <button
          type="button"
          data-testid="coletas-form-cancel-button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          data-testid="coletas-form-submit-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-label="Carregando..." />
          )}
          {isSubmitting ? 'Iniciando...' : 'Iniciar coleta'}
        </button>
      </div>
    </form>
  )
}

export default function ColetasPage() {
  const [jobs, setJobs] = useState<CollectionJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    getJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  const handleStatusUpdate = useCallback((id: string, update: Partial<CollectionJobSummary>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...update } : j))
  }, [])

  const handleNewJob = (job: CollectionJobSummary) => {
    setJobs(prev => [job, ...prev])
    setCreateOpen(false)
  }

  return (
    <div data-testid="coletas-page" className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Coletas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico e progresso das suas coletas de leads
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          data-testid="coletas-create-button"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova coleta
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Zap className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma coleta realizada ainda.</p>
          <button
            data-testid="coletas-empty-create-button"
            onClick={() => setCreateOpen(true)}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Criar primeira coleta
          </button>
        </div>
      ) : (
        <div data-testid="coletas-list" className="space-y-3" role="list" aria-label="Lista de coletas">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onStatusUpdate={handleStatusUpdate} />
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova coleta</DialogTitle>
          </DialogHeader>
          <CollectionForm
            onSuccess={handleNewJob}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
