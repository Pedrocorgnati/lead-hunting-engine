'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { queueJobLiveStatus, type QueueJobStatus } from '@/lib/live-status'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type JobAction = 'retry' | 'cancel' | 'escalate'

interface TimelineEntry {
  at: string
  type: string
  status: string
  message: string
  correlationId: string
}

interface JobDetail {
  id: string
  type: string
  status: string
  priority: string | null
  provider: string | null
  collectionId: string | null
  alertId: string | null
  correlationId: string
  rootCause: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
  lastUpdatedAt: string
  timeline: TimelineEntry[]
}

interface JobAttempt {
  id: string
  attemptNumber: number
  status: string
  provider: string | null
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  errorCode: string | null
  errorMessage: string | null
  correlationId: string
}

interface AttemptsPayload {
  jobId: string
  attempts: JobAttempt[]
  total: number
  lastUpdatedAt: string
  correlationId: string
}

interface JobLog {
  at: string
  level: string
  message: string
  provider: string | null
  collectionId: string | null
  alertId: string | null
  correlationId: string
  metadata: unknown
}

interface LogsPayload {
  jobId: string
  logs: JobLog[]
  total: number
  lastUpdatedAt: string
  correlationId: string
  piiMasked: boolean
}

interface SectionState<T> {
  data: T | null
  loading: boolean
  error: string | null
  notFound: boolean
}

interface ActionConfig {
  action: JobAction
  title: string
  description: string
  danger: boolean
  withEscalateTo: boolean
}

const LOG_LIMITS = [25, 50, 100, 200] as const
const DEFAULT_LOG_LIMIT = 50

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  RUNNING: 'default',
  PAUSED: 'secondary',
  PARTIAL: 'secondary',
  COMPLETED: 'secondary',
  DONE: 'secondary',
  CANCELLED: 'outline',
  FAILED: 'destructive',
}

const LEVEL_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  error: 'destructive',
  warn: 'outline',
  warning: 'outline',
  info: 'secondary',
}

const ACTION_CONFIG: Record<JobAction, ActionConfig> = {
  retry: {
    action: 'retry',
    title: 'Reexecutar job',
    description:
      'Cria uma nova execucao a partir deste job (status retryavel: FAILED, PARTIAL ou CANCELLED) e registra audit log com o motivo informado.',
    danger: false,
    withEscalateTo: false,
  },
  cancel: {
    action: 'cancel',
    title: 'Cancelar job',
    description:
      'Cancela o job (status cancelavel: PENDING, RUNNING ou PAUSED), grava o motivo como erro e registra audit log. Acao destrutiva.',
    danger: true,
    withEscalateTo: false,
  },
  escalate: {
    action: 'escalate',
    title: 'Escalar job',
    description:
      'Registra uma escalada operacional no metadata do job e em audit log, encaminhando para o time responsavel.',
    danger: true,
    withEscalateTo: true,
  },
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
      second: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  return STATUS_VARIANTS[status?.toUpperCase?.() ?? ''] ?? 'outline'
}

function levelVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  return LEVEL_VARIANTS[level?.toLowerCase?.() ?? ''] ?? 'secondary'
}

function fetchMessage(res: Response, fallback: string): string {
  if (res.status === 401 || res.status === 403) return 'Acesso administrativo obrigatorio.'
  if (res.status === 404) return 'Job nao encontrado.'
  if (res.status === 400) return 'Parametros invalidos para esta consulta.'
  return fallback
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copiado.`)
  } catch {
    toast.error('Nao foi possivel copiar para a area de transferencia.')
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function SectionError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      role="alert"
    >
      <span className="inline-flex items-center gap-2">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {message}
      </span>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        Tentar novamente
      </Button>
    </div>
  )
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <CheckCircle2 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export default function AdminJobDetailPage() {
  const params = useParams<{ id: string }>()
  const jobId = Array.isArray(params.id) ? params.id[0] : params.id

  const [detail, setDetail] = useState<SectionState<JobDetail>>({ data: null, loading: true, error: null, notFound: false })
  const [attempts, setAttempts] = useState<SectionState<AttemptsPayload>>({ data: null, loading: true, error: null, notFound: false })
  const [logs, setLogs] = useState<SectionState<LogsPayload>>({ data: null, loading: true, error: null, notFound: false })

  const [logLimit, setLogLimit] = useState<number>(DEFAULT_LOG_LIMIT)
  const [logLevel, setLogLevel] = useState<string>('')
  const [logSearch, setLogSearch] = useState<string>('')

  const [pendingAction, setPendingAction] = useState<ActionConfig | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [escalateTo, setEscalateTo] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!jobId) return
    setDetail((prev) => ({ ...prev, loading: true, error: null, notFound: false }))
    try {
      const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setDetail({ data: null, loading: false, error: 'Job nao encontrado.', notFound: true })
        return
      }
      if (!res.ok) throw new Error(fetchMessage(res, 'Falha ao carregar o resumo do job.'))
      const json = (await res.json()) as { data?: JobDetail }
      setDetail({ data: json.data ?? null, loading: false, error: null, notFound: false })
    } catch (err) {
      setDetail({ data: null, loading: false, error: err instanceof Error ? err.message : 'Falha ao carregar o resumo do job.', notFound: false })
    }
  }, [jobId])

  const loadAttempts = useCallback(async () => {
    if (!jobId) return
    setAttempts((prev) => ({ ...prev, loading: true, error: null, notFound: false }))
    try {
      const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}/attempts`, { cache: 'no-store' })
      if (res.status === 404) {
        setAttempts({ data: null, loading: false, error: 'Job nao encontrado.', notFound: true })
        return
      }
      if (!res.ok) throw new Error(fetchMessage(res, 'Falha ao carregar as tentativas.'))
      const json = (await res.json()) as { data?: AttemptsPayload }
      setAttempts({ data: json.data ?? null, loading: false, error: null, notFound: false })
    } catch (err) {
      setAttempts({ data: null, loading: false, error: err instanceof Error ? err.message : 'Falha ao carregar as tentativas.', notFound: false })
    }
  }, [jobId])

  const loadLogs = useCallback(async () => {
    if (!jobId) return
    setLogs((prev) => ({ ...prev, loading: true, error: null, notFound: false }))
    try {
      const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}/logs?limit=${logLimit}`, { cache: 'no-store' })
      if (res.status === 404) {
        setLogs({ data: null, loading: false, error: 'Job nao encontrado.', notFound: true })
        return
      }
      if (!res.ok) throw new Error(fetchMessage(res, 'Falha ao carregar os logs.'))
      const json = (await res.json()) as { data?: LogsPayload }
      setLogs({ data: json.data ?? null, loading: false, error: null, notFound: false })
    } catch (err) {
      setLogs({ data: null, loading: false, error: err instanceof Error ? err.message : 'Falha ao carregar os logs.', notFound: false })
    }
  }, [jobId, logLimit])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    void loadAttempts()
  }, [loadAttempts])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const reloadAll = useCallback(() => {
    void loadDetail()
    void loadAttempts()
    void loadLogs()
  }, [loadDetail, loadAttempts, loadLogs])

  // Item 049: polling live no contrato canonico (queueJobLiveStatus) — job
  // nao-terminal re-poll a cada live.pollAfter; erro de fetch honra
  // live.retryAfterMs. Terminal (DONE/FAILED) para de pollar.
  useEffect(() => {
    const status = detail.data?.status as QueueJobStatus | undefined
    if (!status && !detail.error) return
    const live = queueJobLiveStatus(status ?? 'PENDING', detail.data?.lastUpdatedAt ?? null)
    if (!detail.error && live.pollAfter <= 0) return
    const delay = detail.error ? live.retryAfterMs : live.pollAfter
    const timer = setTimeout(() => reloadAll(), delay)
    return () => clearTimeout(timer)
  }, [detail, reloadAll])

  const filteredLogs = useMemo(() => {
    const rows = logs.data?.logs ?? []
    const search = logSearch.trim().toLowerCase()
    return rows.filter((log) => {
      if (logLevel && (log.level?.toLowerCase?.() ?? '') !== logLevel) return false
      if (search) {
        const haystack = `${log.message} ${log.correlationId} ${log.provider ?? ''}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [logs.data, logLevel, logSearch])

  const availableLevels = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs.data?.logs ?? []) {
      if (log.level) set.add(log.level.toLowerCase())
    }
    return Array.from(set).sort()
  }, [logs.data])

  function openAction(action: JobAction) {
    setActionReason('')
    setEscalateTo('')
    setPendingAction(ACTION_CONFIG[action])
  }

  async function confirmAction() {
    if (!pendingAction) return
    const reason = actionReason.trim()
    if (reason.length < 5) {
      toast.error('Informe um motivo com pelo menos 5 caracteres para o audit log.')
      return
    }

    setActionBusy(true)
    try {
      const body: Record<string, string> = {
        reason,
        correlationId: detail.data?.correlationId ?? `admin-job-${jobId}`,
      }
      if (pendingAction.withEscalateTo && escalateTo.trim()) {
        body.escalateTo = escalateTo.trim()
      }

      const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}/${pendingAction.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { newJobId?: string; status?: string; auditLogWarning?: boolean }
        error?: { code?: string; message?: string }
      }

      if (!res.ok) {
        throw new Error(json.error?.message ?? fetchMessage(res, 'Falha ao executar a acao no job.'))
      }

      const result = json.data
      if (pendingAction.action === 'retry' && result?.newJobId) {
        toast.success(`Job reexecutado. Nova execucao: ${result.newJobId}.`)
      } else {
        toast.success(`Acao "${pendingAction.action}" concluida${result?.status ? ` (status ${result.status})` : ''}.`)
      }
      if (result?.auditLogWarning) {
        toast.warning('Comando executado, mas o registro de auditoria ficou pendente.')
      }

      setPendingAction(null)
      // Pos-sucesso: invalida a tela recarregando todas as secoes sem redirect.
      reloadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao executar a acao no job.')
    } finally {
      setActionBusy(false)
    }
  }

  const job = detail.data

  if (detail.notFound) {
    return (
      <div className="space-y-6 p-6">
        <Link href="/admin/jobs/fila" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <ArrowLeft aria-hidden="true" />
          Voltar para a fila
        </Link>
        <div className="rounded-lg border border-dashed p-10 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Job nao encontrado.</p>
          <p className="text-sm text-muted-foreground">O id informado nao existe ou foi removido. Verifique a fila de jobs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/jobs/fila"
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}
          >
            <ArrowLeft aria-hidden="true" />
            Fila de jobs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Detalhe do job</h1>
            {job ? <Badge variant={statusVariant(job.status)}>{job.status}</Badge> : null}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{jobId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={reloadAll} disabled={detail.loading}>
            {detail.loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => openAction('retry')} disabled={actionBusy || detail.loading || !!detail.error || !detail.data}>
            <RotateCcw aria-hidden="true" />
            Reexecutar
          </Button>
          <Button variant="outline" onClick={() => openAction('escalate')} disabled={actionBusy || detail.loading || !!detail.error || !detail.data}>
            <ShieldAlert aria-hidden="true" />
            Escalar
          </Button>
          <Button variant="destructive" onClick={() => openAction('cancel')} disabled={actionBusy || detail.loading || !!detail.error || !detail.data}>
            <Ban aria-hidden="true" />
            Cancelar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="resumo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="attempts">Tentativas</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          {detail.loading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : detail.error ? (
            <SectionError message={detail.error} onRetry={loadDetail} busy={detail.loading} />
          ) : job ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Resumo</CardTitle>
                  <CardDescription>Identificacao, contexto e correlacao do job.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <FieldRow label="Tipo">{job.type}</FieldRow>
                  <FieldRow label="Status">
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  </FieldRow>
                  <FieldRow label="Prioridade">{job.priority ?? '-'}</FieldRow>
                  <FieldRow label="Provider">
                    {job.provider ? (
                      <span className="inline-flex items-center gap-2">
                        {job.provider}
                        <Link
                          href={`/admin/config/scrapers`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          configuracao
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      </span>
                    ) : (
                      '-'
                    )}
                  </FieldRow>
                  <FieldRow label="Coleta">
                    {job.collectionId ? (
                      <Link
                        href={`/coletas/${encodeURIComponent(job.collectionId)}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                      >
                        {job.collectionId}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ) : (
                      '-'
                    )}
                  </FieldRow>
                  <FieldRow label="Alerta">
                    {job.alertId ? (
                      <Link
                        href={`/admin/dlq?correlationId=${encodeURIComponent(job.correlationId)}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                      >
                        {job.alertId}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ) : (
                      '-'
                    )}
                  </FieldRow>
                  <FieldRow label="Correlation ID">
                    <span className="inline-flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{job.correlationId}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(job.correlationId, 'Correlation ID')}
                        aria-label="Copiar correlation id"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  </FieldRow>
                  <FieldRow label="Criado em">{formatDate(job.createdAt)}</FieldRow>
                  <FieldRow label="Iniciado em">{formatDate(job.startedAt)}</FieldRow>
                  <FieldRow label="Finalizado em">{formatDate(job.finishedAt)}</FieldRow>
                  <FieldRow label="Ultima atualizacao">{formatDate(job.lastUpdatedAt)}</FieldRow>
                </CardContent>
              </Card>

              {job.rootCause ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                      Root cause
                    </CardTitle>
                    <CardDescription>Causa raiz inferida da falha (PII mascarada).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {job.rootCause}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>Eventos do ciclo de vida do job em ordem cronologica.</CardDescription>
                </CardHeader>
                <CardContent>
                  {job.timeline.length === 0 ? (
                    <SectionEmpty message="Nenhum evento de timeline registrado." />
                  ) : (
                    <ol className="space-y-4">
                      {job.timeline.map((entry, index) => (
                        <li key={`${entry.type}-${entry.at}-${index}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                            {index < job.timeline.length - 1 ? <span className="w-px flex-1 bg-border" aria-hidden="true" /> : null}
                          </div>
                          <div className="space-y-1 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                              <span className="text-xs font-medium text-muted-foreground">{entry.type}</span>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock3 className="h-3 w-3" aria-hidden="true" />
                                {formatDate(entry.at)}
                              </span>
                            </div>
                            <p className="text-sm">{entry.message}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <SectionEmpty message="Resumo indisponivel." />
          )}
        </TabsContent>

        <TabsContent value="attempts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tentativas</CardTitle>
              <CardDescription>
                {attempts.data ? `${attempts.data.total} tentativa(s) registrada(s).` : 'Historico de execucoes do job.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attempts.loading ? (
                <div className="space-y-2" aria-busy="true">
                  {[1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-16 w-full" />
                  ))}
                </div>
              ) : attempts.error ? (
                <SectionError message={attempts.error} onRetry={loadAttempts} busy={attempts.loading} />
              ) : (attempts.data?.attempts.length ?? 0) === 0 ? (
                <SectionEmpty message="Nenhuma tentativa registrada." />
              ) : (
                <ul className="space-y-3">
                  {attempts.data?.attempts.map((attempt) => (
                    <li key={attempt.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">Tentativa #{attempt.attemptNumber}</span>
                          <Badge variant={statusVariant(attempt.status)}>{attempt.status}</Badge>
                          {attempt.provider ? (
                            <span className="text-xs text-muted-foreground">via {attempt.provider}</span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">Duracao: {formatDuration(attempt.durationMs)}</span>
                      </div>
                      <Separator className="my-3" />
                      <div className="grid gap-3 text-sm md:grid-cols-3">
                        <FieldRow label="Iniciado">{formatDate(attempt.startedAt)}</FieldRow>
                        <FieldRow label="Finalizado">{formatDate(attempt.finishedAt)}</FieldRow>
                        <FieldRow label="Correlation ID">
                          <code className="font-mono text-xs">{attempt.correlationId}</code>
                        </FieldRow>
                      </div>
                      {attempt.errorMessage || attempt.errorCode ? (
                        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                          {attempt.errorCode ? <span className="font-mono">[{attempt.errorCode}] </span> : null}
                          {attempt.errorMessage ?? 'Falha sem mensagem detalhada.'}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
              <CardDescription>
                Eventos de auditoria e erro do job (PII mascarada). Filtre por nivel, texto ou correlation id.
                O filtro atua sobre os {logLimit} logs carregados; aumente o limite para ampliar a busca.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Nivel
                  <select
                    value={logLevel}
                    onChange={(event) => setLogLevel(event.target.value)}
                    className="h-11 min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm"
                    aria-label="Filtrar nivel do log"
                  >
                    <option value="">Todos</option>
                    {availableLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Buscar
                  <Input
                    value={logSearch}
                    onChange={(event) => setLogSearch(event.target.value)}
                    placeholder="mensagem, provider ou correlation id"
                    aria-label="Buscar nos logs"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Limite
                  <select
                    value={logLimit}
                    onChange={(event) => setLogLimit(Number(event.target.value))}
                    className="h-11 min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm"
                    aria-label="Limite de logs carregados"
                  >
                    {LOG_LIMITS.map((limit) => (
                      <option key={limit} value={limit}>
                        {limit} ultimos
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {logs.loading ? (
                <div className="space-y-2" aria-busy="true">
                  {[1, 2, 3, 4].map((item) => (
                    <Skeleton key={item} className="h-12 w-full" />
                  ))}
                </div>
              ) : logs.error ? (
                <SectionError message={logs.error} onRetry={loadLogs} busy={logs.loading} />
              ) : (logs.data?.logs.length ?? 0) === 0 ? (
                <SectionEmpty message="Nenhum log disponivel." />
              ) : filteredLogs.length === 0 ? (
                <SectionEmpty message="Nenhum log corresponde aos filtros atuais." />
              ) : (
                <ul className="space-y-2">
                  {filteredLogs.map((log, index) => (
                    <li key={`${log.at}-${index}`} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={levelVariant(log.level)}>{log.level}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="h-3 w-3" aria-hidden="true" />
                          {formatDate(log.at)}
                        </span>
                        {log.provider ? <span className="text-xs text-muted-foreground">{log.provider}</span> : null}
                        <code className="ml-auto font-mono text-[11px] text-muted-foreground">{log.correlationId}</code>
                      </div>
                      <p className="mt-1.5 text-sm">{log.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setPendingAction(null)
        }}
        title={pendingAction?.title ?? 'Confirmar acao'}
        danger={pendingAction?.danger}
        loading={actionBusy}
        confirmLabel="Confirmar acao"
        description={
          <div className="space-y-3">
            <p>{pendingAction?.description}</p>
            <label className="block space-y-1 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Motivo operacional (audit log)
              </span>
              <Textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                className="min-h-24"
                placeholder="Descreva o motivo (minimo 5 caracteres) para o audit log"
                aria-label="Motivo operacional da acao"
              />
            </label>
            {pendingAction?.withEscalateTo ? (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Escalar para (opcional)</span>
                <Input
                  value={escalateTo}
                  onChange={(event) => setEscalateTo(event.target.value)}
                  placeholder="operations"
                  aria-label="Time de destino da escalada"
                />
              </label>
            ) : null}
          </div>
        }
        onConfirm={confirmAction}
      />
    </div>
  )
}
