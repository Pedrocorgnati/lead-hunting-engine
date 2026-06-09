'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock, Eye, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type DsarType = 'EXPORT' | 'DELETION'
type DsarStatus =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'EXPORT_READY'
  | 'DELETION_EXECUTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
type SlaState = 'OK' | 'DUE_SOON' | 'OVERDUE'

interface DsarTimelineEvent {
  status: DsarStatus
  action: string
  at: string
  auditEventId: string
  correlationId: string | null
}

interface DsarSummary {
  requestId: string
  type: DsarType
  status: DsarStatus
  requestedAt: string
  dueAt: string
  completedAt: string | null
  sla: SlaState
  correlationId: string | null
  subject: {
    userId: string | null
    name: string | null
    email: string | null
  }
  timeline: DsarTimelineEvent[]
  links: {
    detail: string
  }
}

interface DsarDetail extends DsarSummary {
  evidence: {
    attachments: Array<{
      id: string
      type: string
      filename: string
      mimeType: string | null
      sizeBytes: number | null
      hash: string
      url: string | null
      note: string | null
      attachedAt: string
      auditEventId: string
      correlationId: string | null
      author: {
        userId: string | null
        name: string | null
        email: string | null
      }
    }>
    consentReceipts: Array<{
      receiptId: string
      policyVersion: string
      acceptedAt: string
      categories: string[]
      hash: string
      downloadUrl: string
    }>
    termsAcceptedAt: string | null
    auditEvents: Array<{
      id: string
      action: string
      resource: string
      resourceId: string | null
      createdAt: string
      correlationId: string | null
      author: {
        userId: string | null
        name: string | null
        email: string | null
      }
    }>
  }
}

interface ApiListResponse {
  data?: DsarSummary[]
  meta?: {
    page: number
    limit: number
    total: number
    hasNext: boolean
    hasPrev: boolean
  }
}

interface Filters {
  status: '' | DsarStatus
  type: '' | DsarType
  sla: '' | SlaState
  subject: string
  correlationId: string
}

const PAGE_SIZE = 20

const EMPTY_FILTERS: Filters = {
  status: '',
  type: '',
  sla: '',
  subject: '',
  correlationId: '',
}

const STATUS_OPTIONS: DsarStatus[] = [
  'REQUESTED',
  'PROCESSING',
  'EXPORT_READY',
  'DELETION_EXECUTED',
  'COMPLETED',
  'FAILED',
  'CANCELED',
]

const STATUS_LABELS: Record<DsarStatus, string> = {
  REQUESTED: 'Solicitado',
  PROCESSING: 'Processando',
  EXPORT_READY: 'Exportacao pronta',
  DELETION_EXECUTED: 'Exclusao executada',
  COMPLETED: 'Concluido',
  FAILED: 'Falhou',
  CANCELED: 'Cancelado',
}

const TYPE_LABELS: Record<DsarType, string> = {
  EXPORT: 'Exportacao',
  DELETION: 'Exclusao',
}

const SLA_LABELS: Record<SlaState, string> = {
  OK: 'No prazo',
  DUE_SOON: 'SLA proximo',
  OVERDUE: 'SLA vencido',
}

const STATUS_BADGE_VARIANT: Record<DsarStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  REQUESTED: 'outline',
  PROCESSING: 'secondary',
  EXPORT_READY: 'default',
  DELETION_EXECUTED: 'default',
  COMPLETED: 'secondary',
  FAILED: 'destructive',
  CANCELED: 'outline',
}

const SLA_BADGE_VARIANT: Record<SlaState, 'secondary' | 'destructive' | 'outline'> = {
  OK: 'secondary',
  DUE_SOON: 'outline',
  OVERDUE: 'destructive',
}

function formatDate(value: string | null): string {
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
  return value.length > 12 ? value.slice(0, 12) : value
}

function maskEmail(value: string | null): string {
  if (!value) return 'Titular mascarado'
  const [local, domain] = value.split('@')
  if (!local || !domain) return '***'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain.slice(0, 1)}***`
}

function maskName(value: string | null): string {
  if (!value) return 'Sem nome'
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${'*'.repeat(Math.max(2, part.length - 1))}`)
    .join(' ')
}

function subjectLabel(subject: DsarSummary['subject']) {
  return `${maskName(subject.name)} - ${maskEmail(subject.email)}`
}

function getFetchMessage(res: Response): string {
  if (res.status === 401 || res.status === 403) return 'Acesso administrativo obrigatorio.'
  if (res.status === 400) return 'Filtros invalidos para a fila DSAR.'
  return 'Falha ao carregar a fila DSAR.'
}

export default function AdminDsarPage() {
  const [requests, setRequests] = useState<DsarSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [selected, setSelected] = useState<DsarDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (filters.status) params.set('status', filters.status)
    if (filters.type) params.set('type', filters.type)
    if (filters.sla) params.set('sla', filters.sla)
    if (filters.subject.trim()) params.set('subject', filters.subject.trim())
    if (filters.correlationId.trim()) params.set('correlationId', filters.correlationId.trim())
    return params.toString()
  }, [filters, page])

  const statusCounts = useMemo(() => {
    return STATUS_OPTIONS.reduce<Record<DsarStatus, number>>((acc, status) => {
      acc[status] = requests.filter((request) => request.status === status).length
      return acc
    }, {} as Record<DsarStatus, number>)
  }, [requests])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/admin/dsar/requests?${queryString}`)
      if (!res.ok) throw new Error(getFetchMessage(res))
      const json = (await res.json()) as ApiListResponse
      setRequests(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
      setLastUpdatedAt(new Date().toISOString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha inesperada ao carregar DSAR.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  async function loadDetail(request: DsarSummary) {
    setDetailLoadingId(request.requestId)
    try {
      const res = await fetch(request.links.detail)
      if (!res.ok) throw new Error(getFetchMessage(res))
      const json = (await res.json()) as { data?: { request?: DsarDetail } }
      if (!json.data?.request) throw new Error('Detalhe DSAR indisponivel.')
      setSelected(json.data.request)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar detalhe DSAR.')
    } finally {
      setDetailLoadingId(null)
    }
  }

  const hasNext = page * PAGE_SIZE < total

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fila admin de DSAR</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe exportacoes e exclusoes LGPD com PII mascarada, SLA e auditEvent.
          </p>
        </div>
        <Button variant="outline" onClick={loadRequests} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Total filtrado</CardTitle>
            <CardDescription>{lastUpdatedAt ? `Atualizado ${formatDate(lastUpdatedAt)}` : 'Aguardando carga'}</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{total}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Fluxo exportacao</CardTitle>
            <CardDescription>REQUESTED para EXPORT_READY e COMPLETED</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {statusCounts.REQUESTED + statusCounts.EXPORT_READY + statusCounts.COMPLETED}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Fluxo exclusao</CardTitle>
            <CardDescription>REQUESTED para DELETION_EXECUTED e COMPLETED</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {statusCounts.DELETION_EXECUTED + statusCounts.COMPLETED}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>SLA critico</CardTitle>
            <CardDescription>Vencido ou proximo do vencimento</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {requests.filter((request) => request.sla !== 'OK').length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros da fila</CardTitle>
          <CardDescription>Filtre por estado operacional, tipo de DSAR, SLA, titular mascarado ou correlationId.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Status
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value as Filters['status'])}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
              <select
                value={filters.type}
                onChange={(event) => updateFilter('type', event.target.value as Filters['type'])}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="EXPORT">Exportacao</option>
                <option value="DELETION">Exclusao</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              SLA
              <select
                value={filters.sla}
                onChange={(event) => updateFilter('sla', event.target.value as Filters['sla'])}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="OK">No prazo</option>
                <option value="DUE_SOON">Proximo</option>
                <option value="OVERDUE">Vencido</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Titular
              <Input
                value={filters.subject}
                onChange={(event) => updateFilter('subject', event.target.value)}
                placeholder="Nome ou email"
                aria-label="Filtrar titular"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Correlation ID
              <Input
                value={filters.correlationId}
                onChange={(event) => updateFilter('correlationId', event.target.value)}
                placeholder="correlationId"
                aria-label="Filtrar correlation id"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              PII exibida apenas em formato mascarado.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetFilters} disabled={loading}>
                Limpar
              </Button>
              <Button onClick={loadRequests} disabled={loading}>
                <Search aria-hidden="true" />
                Aplicar
              </Button>
            </div>
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

      {!loading && !error && requests.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Nenhuma solicitacao DSAR encontrada.</p>
          <p className="text-sm text-muted-foreground">Ajuste os filtros ou atualize a fila.</p>
        </div>
      ) : null}

      {!loading && !error && requests.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitacao</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Atualizacao</TableHead>
                  <TableHead>Audit event</TableHead>
                  <TableHead className="text-right">Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const lastEvent = request.timeline.at(-1)
                  return (
                    <TableRow key={request.requestId}>
                      <TableCell className="font-mono text-xs">{shortId(request.requestId)}</TableCell>
                      <TableCell className="min-w-56">
                        <div className="text-sm font-medium">{subjectLabel(request.subject)}</div>
                        <div className="font-mono text-xs text-muted-foreground">{shortId(request.subject.userId)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[request.type]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[request.status]}>{STATUS_LABELS[request.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SLA_BADGE_VARIANT[request.sla]}>{SLA_LABELS[request.sla]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(lastEvent?.at ?? request.requestedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(lastEvent?.auditEventId)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadDetail(request)}
                          disabled={detailLoadingId === request.requestId}
                          aria-label={`Consultar auditEvent da solicitacao ${request.requestId}`}
                        >
                          {detailLoadingId === request.requestId ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Eye aria-hidden="true" />
                          )}
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Pagina {page} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || loading}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={!hasNext || loading}>
                  Proxima
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>DSAR {shortId(selected.requestId)}</DialogTitle>
                <DialogDescription>
                  {TYPE_LABELS[selected.type]} - {STATUS_LABELS[selected.status]} - {SLA_LABELS[selected.sla]}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-3">
                <DetailBlock label="Titular" value={subjectLabel(selected.subject)} />
                <DetailBlock label="Solicitado em" value={formatDate(selected.requestedAt)} />
                <DetailBlock label="Prazo" value={formatDate(selected.dueAt)} />
                <DetailBlock label="Concluido em" value={formatDate(selected.completedAt)} />
                <DetailBlock label="Correlation ID" value={selected.correlationId ?? '-'} />
                <DetailBlock label="Termos aceitos" value={formatDate(selected.evidence.termsAcceptedAt)} />
              </div>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Linha do tempo</h2>
                <div className="space-y-2">
                  {selected.timeline.map((event) => (
                    <div key={`${event.auditEventId}-${event.status}-${event.at}`} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant={STATUS_BADGE_VARIANT[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(event.at)}</span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                        <span>Acao: {event.action}</span>
                        <span className="font-mono">auditEvent: {event.auditEventId}</span>
                        <span className="font-mono md:col-span-2">correlationId: {event.correlationId ?? '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Evidencias</h2>
                <div className="grid gap-2 md:grid-cols-2">
                  <EvidenceCount label="Anexos" value={selected.evidence.attachments.length} />
                  <EvidenceCount label="Recibos de consentimento" value={selected.evidence.consentReceipts.length} />
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Audit events consultaveis</h2>
                <div className="rounded-lg border">
                  {selected.evidence.auditEvents.map((event) => (
                    <div key={event.id} className="grid gap-1 border-b p-3 text-xs last:border-b-0 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="font-medium">{event.action}</div>
                        <div className="text-muted-foreground">
                          {event.resource} {event.resourceId ? `- ${shortId(event.resourceId)}` : ''}
                        </div>
                      </div>
                      <div className="text-left text-muted-foreground md:text-right">
                        <div>{formatDate(event.createdAt)}</div>
                        <div className="font-mono">{event.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1 break-words text-sm', value.length > 28 ? 'font-mono text-xs' : 'font-medium')}>
        {value}
      </div>
    </div>
  )
}

function EvidenceCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}
