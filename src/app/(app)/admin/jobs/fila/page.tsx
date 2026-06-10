'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { queueJobLiveStatus, formatLastUpdated } from '@/lib/live-status'
import type { QueueJobStatus } from '@/lib/live-status'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

type QueueStatus = 'PENDING' | 'LEASED' | 'DONE' | 'FAILED'
type QueueAction = 'bulk-retry' | 'bulk-cancel' | 'pause' | 'resume'

interface QueueJob {
  id: string
  kind: string
  status: QueueStatus | string
  attempts: number
  priority: string | null
  correlationId: string | null
  collectionJobId: string | null
  runAt: string
  createdAt: string
  leasedUntil: string | null
  lastError: string | null
  lastUpdatedAt: string
}

interface QueueStats {
  filters?: Record<string, string>
  total: number
  byStatus: Record<string, number>
  pending: number
  leased: number
  done: number
  failed: number
  nextRunAt: string | null
  oldestPendingAt: string | null
  lastUpdatedAt: string | null
  dlqEndpoint: string
}

interface ListResponse {
  data?: QueueJob[]
  meta?: {
    page: number
    limit: number
    total: number
    hasNext: boolean
    hasPrev: boolean
  }
}

interface StatsResponse {
  data?: QueueStats
}

interface ActionResponse {
  data?: {
    correlationId: string
    summary: {
      requested: number
      succeeded: number
      failed: number
      affected: number
      errors: Array<{ jobId: string; code: string; message: string }>
    }
  }
  error?: {
    code: string
    message: string
  }
}

interface Filters {
  status: '' | QueueStatus
  kind: string
  priority: string
  correlationId: string
}

interface PendingAction {
  kind: QueueAction
  title: string
  description: string
  endpoint: string
  phrase?: string
  danger?: boolean
}

const PAGE_SIZE = 20
const DEFAULT_POLLING_MS = 5000

const EMPTY_FILTERS: Filters = {
  status: '',
  kind: '',
  priority: '',
  correlationId: '',
}

const STATUS_OPTIONS: QueueStatus[] = ['PENDING', 'LEASED', 'DONE', 'FAILED']

const STATUS_LABELS: Record<QueueStatus, string> = {
  PENDING: 'Pendente',
  LEASED: 'Em execucao',
  DONE: 'Concluido',
  FAILED: 'Falhou',
}

const STATUS_VARIANTS: Record<QueueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  LEASED: 'default',
  DONE: 'secondary',
  FAILED: 'destructive',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function shortId(value: string | null | undefined): string {
  if (!value) return '-'
  return value.length > 12 ? `${value.slice(0, 12)}...` : value
}

function statusLabel(status: string): string {
  return STATUS_OPTIONS.includes(status as QueueStatus) ? STATUS_LABELS[status as QueueStatus] : status
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  return STATUS_OPTIONS.includes(status as QueueStatus) ? STATUS_VARIANTS[status as QueueStatus] : 'outline'
}

function getDominantStatus(jobs: QueueJob[], stats: QueueStats | null): QueueJobStatus {
  if (stats) {
    const counts: Record<string, number> = stats.byStatus ?? {}
    const ordered: QueueJobStatus[] = ['FAILED', 'LEASED', 'PENDING', 'DONE']
    for (const status of ordered) {
      if ((counts[status] ?? 0) > 0) return status
    }
  }
  if (jobs.length > 0) {
    const counts: Record<string, number> = {}
    for (const job of jobs) {
      counts[job.status] = (counts[job.status] ?? 0) + 1
    }
    const ordered: QueueJobStatus[] = ['FAILED', 'LEASED', 'PENDING', 'DONE']
    for (const status of ordered) {
      if ((counts[status] ?? 0) > 0) return status
    }
  }
  return 'PENDING'
}

function getFetchMessage(res: Response): string {
  if (res.status === 401 || res.status === 403) return 'Acesso administrativo obrigatorio.'
  if (res.status === 400) return 'Filtros ou payload invalidos para a fila de jobs.'
  return 'Falha ao carregar a fila de jobs.'
}

function buildAction(kind: QueueAction, selectedCount: number): PendingAction {
  const plural = selectedCount === 1 ? 'job selecionado' : 'jobs selecionados'
  const descriptions: Record<QueueAction, PendingAction> = {
    'bulk-retry': {
      kind,
      title: 'Reexecutar jobs selecionados',
      description: `Esta acao cria novas execucoes para ${selectedCount} ${plural} e registra audit log.`,
      endpoint: '/api/v1/admin/jobs/bulk-retry',
      phrase: 'REEXECUTAR JOBS',
    },
    'bulk-cancel': {
      kind,
      title: 'Cancelar jobs selecionados',
      description: `Esta acao cancela ${selectedCount} ${plural}, registra motivo e nao pode ser desfeita pela tela.`,
      endpoint: '/api/v1/admin/jobs/bulk-cancel',
      phrase: 'CANCELAR JOBS',
      danger: true,
    },
    pause: {
      kind,
      title: 'Pausar jobs selecionados',
      description: `Esta acao pausa ${selectedCount} ${plural} com motivo operacional.`,
      endpoint: '/api/v1/admin/jobs/queue/pause',
    },
    resume: {
      kind,
      title: 'Retomar jobs selecionados',
      description: `Esta acao retoma ${selectedCount} ${plural} pausados e limpa erro operacional quando aplicavel.`,
      endpoint: '/api/v1/admin/jobs/queue/resume',
    },
  }
  return descriptions[kind]
}

export default function AdminJobsQueuePage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-32 w-full" /></div>}>
      <AdminJobsQueueInner />
    </Suspense>
  )
}

function AdminJobsQueueInner() {
  // Item 063: deep-links como /admin/jobs/fila?status=FAILED (vindos do
  // InlineRecoveryPanel e de mensagens de erro) pre-aplicam os filtros.
  const searchParams = useSearchParams()
  const initialFilters: Filters = {
    ...EMPTY_FILTERS,
    status: STATUS_OPTIONS.includes((searchParams.get('status') ?? '') as QueueStatus)
      ? ((searchParams.get('status') as QueueStatus) ?? '')
      : '',
    kind: searchParams.get('kind') ?? '',
  }

  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<ReturnType<typeof queueJobLiveStatus> | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (filters.status) params.set('status', filters.status)
    if (filters.kind.trim()) params.set('kind', filters.kind.trim())
    if (filters.priority.trim()) params.set('priority', filters.priority.trim())
    if (filters.correlationId.trim()) params.set('correlationId', filters.correlationId.trim())
    return params.toString()
  }, [filters, page])

  const statsQueryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.kind.trim()) params.set('kind', filters.kind.trim())
    if (filters.priority.trim()) params.set('priority', filters.priority.trim())
    if (filters.correlationId.trim()) params.set('correlationId', filters.correlationId.trim())
    return params.toString()
  }, [filters.status, filters.kind, filters.priority, filters.correlationId])

  const selectedCount = selectedIds.length
  const hasNext = page * PAGE_SIZE < total
  const allVisibleSelected = jobs.length > 0 && jobs.every((job) => selectedIds.includes(job.id))

  const loadQueue = useCallback(
    async (mode: 'initial' | 'manual' | 'poll' = 'manual') => {
      if (mode === 'initial') setLoading(true)
      if (mode === 'manual') setRefreshing(true)
      setError(null)

      try {
        const statsUrl = statsQueryString
          ? `/api/v1/admin/jobs/queue/stats?${statsQueryString}`
          : '/api/v1/admin/jobs/queue/stats'
        const [jobsRes, statsRes] = await Promise.all([
          fetch(`/api/v1/admin/jobs?${queryString}`, { cache: 'no-store' }),
          fetch(statsUrl, { cache: 'no-store' }),
        ])

        if (!jobsRes.ok) throw new Error(getFetchMessage(jobsRes))
        if (!statsRes.ok) throw new Error(getFetchMessage(statsRes))

        const jobsJson = (await jobsRes.json()) as ListResponse
        const statsJson = (await statsRes.json()) as StatsResponse
        const nextJobs = jobsJson.data ?? []

        setJobs(nextJobs)
        const nextStats = statsJson.data ?? null
        setStats(nextStats)
        setTotal(jobsJson.meta?.total ?? 0)
        setSelectedIds((current) => current.filter((id) => nextJobs.some((job) => job.id === id)))
        const serverLastUpdated = nextStats?.lastUpdatedAt ?? new Date().toISOString()
        setLastUpdatedAt(serverLastUpdated)
        // Contrato live: status predominante da fila
        const dominantStatus = getDominantStatus(nextJobs, nextStats)
        setLiveStatus(queueJobLiveStatus(dominantStatus, serverLastUpdated))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha inesperada ao carregar fila de jobs.'
        setError(message)
        if (mode !== 'poll') toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [queryString, statsQueryString],
  )

  useEffect(() => {
    void loadQueue('initial')
  }, [loadQueue])

  useEffect(() => {
    // Fila admin nunca tem estado terminal: manter polling minimo mesmo quando pollAfter=0
    const intervalMs = liveStatus?.pollAfter
      ? Math.max(liveStatus.pollAfter, DEFAULT_POLLING_MS)
      : DEFAULT_POLLING_MS
    const interval = window.setInterval(() => {
      void loadQueue('poll')
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [loadQueue, liveStatus?.pollAfter])

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  function toggleVisibleSelection() {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !jobs.some((job) => job.id === id)))
      return
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...jobs.map((job) => job.id)])))
  }

  function toggleJobSelection(jobId: string) {
    setSelectedIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId],
    )
  }

  function openAction(kind: QueueAction) {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um job antes de executar a acao.')
      return
    }
    setActionReason('')
    setPendingAction(buildAction(kind, selectedIds.length))
  }

  async function confirmAction() {
    if (!pendingAction) return
    if (actionReason.trim().length < 5) {
      toast.error('Informe um motivo operacional com pelo menos 5 caracteres.')
      return
    }

    setActionBusy(true)
    try {
      const res = await fetch(pendingAction.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobIds: selectedIds.map((queueId) => {
            const job = jobs.find((j) => j.id === queueId)
            return job?.collectionJobId ?? queueId
          }),
          reason: actionReason.trim(),
          confirmationChallenge: pendingAction.phrase,
          correlationId: `admin-jobs-${Date.now()}`,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as ActionResponse
      if (!res.ok) {
        throw new Error(json.error?.message ?? getFetchMessage(res))
      }

      const summary = json.data?.summary
      const failed = summary?.failed ?? 0
      const succeeded = summary?.succeeded ?? 0
      if (failed > 0) {
        toast.warning(`${succeeded} jobs afetados, ${failed} falharam. Confira estados e filtros.`)
      } else {
        toast.success(`${succeeded} jobs processados com sucesso.`)
      }
      setPendingAction(null)
      setSelectedIds([])
      await loadQueue('manual')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao executar acao operacional.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* aria-live region para leitores de tela */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveStatus?.ariaLiveMessage ?? 'Carregando fila de jobs'}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fila admin de jobs</h1>
          <p className="text-sm text-muted-foreground">
            Diagnostique a fila geral, aplique filtros e opere jobs em massa sem acessar a DLQ.
          </p>
        </div>
        <Button variant="outline" onClick={() => loadQueue('manual')} disabled={loading || refreshing}>
          {loading || refreshing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>{lastUpdatedAt ? `Atualizado ${formatDate(lastUpdatedAt)}` : 'Aguardando carga'}</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.total ?? total}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
            <CardDescription>Proximo run {formatDate(stats?.nextRunAt)}</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.pending ?? 0}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Em execucao</CardTitle>
            <CardDescription>Leased no worker local</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.leased ?? 0}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Falhos</CardTitle>
            <CardDescription>Use retry em massa com G6</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-destructive">{stats?.failed ?? 0}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Concluidos</CardTitle>
            <CardDescription>Recorte dos filtros atuais</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.done ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros operacionais</CardTitle>
          <CardDescription>
            Polling automatico a cada 5s. Ultima leitura da API: {formatDate(lastUpdatedAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Status
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value as Filters['status'])}
                className="h-11 min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Tipo
              <Input
                value={filters.kind}
                onChange={(event) => updateFilter('kind', event.target.value)}
                placeholder="collect-leads"
                aria-label="Filtrar tipo de job"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Prioridade
              <Input
                value={filters.priority}
                onChange={(event) => updateFilter('priority', event.target.value)}
                placeholder="high"
                aria-label="Filtrar prioridade"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Correlation ID
              <Input
                value={filters.correlationId}
                onChange={(event) => updateFilter('correlationId', event.target.value)}
                placeholder="corr-..."
                aria-label="Filtrar correlation id"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {liveStatus?.statusLabel ?? 'Atualizando'} — {formatLastUpdated(stats?.lastUpdatedAt ?? lastUpdatedAt)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={resetFilters} disabled={loading}>
                Limpar
              </Button>
              <Button onClick={() => loadQueue('manual')} disabled={loading || refreshing}>
                <Search aria-hidden="true" />
                Aplicar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comandos em massa</CardTitle>
          <CardDescription>
            {selectedCount > 0 ? `${selectedCount} jobs selecionados para acao operacional.` : 'Selecione jobs na tabela para liberar comandos.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openAction('pause')} disabled={selectedCount === 0 || actionBusy}>
              <Pause aria-hidden="true" />
              Pausar
            </Button>
            <Button variant="outline" onClick={() => openAction('resume')} disabled={selectedCount === 0 || actionBusy}>
              <Play aria-hidden="true" />
              Retomar
            </Button>
            <Button variant="outline" onClick={() => openAction('bulk-retry')} disabled={selectedCount === 0 || actionBusy}>
              <RotateCcw aria-hidden="true" />
              Retry em massa
            </Button>
            <Button variant="destructive" onClick={() => openAction('bulk-cancel')} disabled={selectedCount === 0 || actionBusy}>
              <Ban aria-hidden="true" />
              Cancelar em massa
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {error && !loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {!loading && !error && jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Nenhum job encontrado.</p>
          <p className="text-sm text-muted-foreground">Ajuste os filtros ou aguarde a proxima leitura do polling.</p>
        </div>
      ) : null}

      {!loading && !error && jobs.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                      aria-label="Selecionar jobs visiveis"
                      className="h-4 w-4 rounded border-input"
                    />
                  </TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Proxima execucao</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Correlation ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id} data-state={selectedIds.includes(job.id) ? 'selected' : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                        aria-label={`Selecionar job ${job.id}`}
                        className="h-4 w-4 rounded border-input"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/jobs/${job.id}`}
                        className="font-mono text-xs underline-offset-2 hover:underline text-foreground"
                        data-testid={`job-detail-link-${job.id}`}
                      >
                        {shortId(job.id)}
                      </Link>
                      <div className="text-xs text-muted-foreground">Criado {formatDate(job.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate" title={job.kind}>
                      {job.kind}
                    </TableCell>
                    <TableCell>{job.priority ?? '-'}</TableCell>
                    <TableCell>{job.attempts}</TableCell>
                    <TableCell>
                      <div className="text-xs">{formatDate(job.runAt)}</div>
                      {job.leasedUntil ? (
                        <div className="text-xs text-muted-foreground">Lease ate {formatDate(job.leasedUntil)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-destructive" title={job.lastError ?? ''}>
                      {job.lastError ? (
                        <span className="inline-flex items-center gap-1">
                          <XCircle className="h-3 w-3" aria-hidden="true" />
                          {job.lastError}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{shortId(job.correlationId)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <Button variant="outline" onClick={() => setPage((current) => current + 1)} disabled={!hasNext}>
            Proxima
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setPendingAction(null)
        }}
        title={pendingAction?.title ?? 'Confirmar acao'}
        description={
          <div className="space-y-3">
            <p>{pendingAction?.description}</p>
            <label className="block space-y-1 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Motivo operacional
              </span>
              <textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Descreva o motivo para audit log"
                aria-label="Motivo operacional da acao"
              />
            </label>
          </div>
        }
        danger={pendingAction?.danger}
        loading={actionBusy}
        confirmationPhrase={pendingAction?.phrase}
        confirmLabel="Confirmar acao"
        onConfirm={confirmAction}
      />
    </div>
  )
}
