'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Megaphone,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/hooks/use-auth'
import { Routes } from '@/lib/constants'
import { cn } from '@/lib/utils'

type MaintenanceSeverity = 'info' | 'warning' | 'critical'
type ActionKey = 'refresh' | 'activate' | 'deactivate' | 'schedule' | 'publish' | 'cancel'

interface MaintenanceWindowConfig {
  enabled: boolean
  reason: string
  message: string
  severity: MaintenanceSeverity
  startsAt: string
  endsAt: string | null
  updatedAt: string
  updatedBy: string | null
  bannerPublishedAt: string | null
}

interface AuditEvent {
  id: string
  action: string
  resource: string
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  userId: string | null
  user: { id: string; name: string | null; email: string } | null
}

interface FormState {
  reason: string
  message: string
  severity: MaintenanceSeverity
  startsAt: string
  endsAt: string
}

const EMPTY_FORM: FormState = {
  reason: 'Manutenção programada',
  message: 'Estamos em manutenção. Voltamos em instantes.',
  severity: 'warning',
  startsAt: '',
  endsAt: '',
}

const SEVERITY_LABELS: Record<MaintenanceSeverity, string> = {
  info: 'Informativo',
  warning: 'Atenção',
  critical: 'Crítico',
}

const SEVERITY_BADGE_VARIANT: Record<
  MaintenanceSeverity,
  'secondary' | 'outline' | 'destructive'
> = {
  info: 'secondary',
  warning: 'outline',
  critical: 'destructive',
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isWindowActive(window: MaintenanceWindowConfig | null): boolean {
  if (!window?.enabled) return false
  const now = Date.now()
  const startsAt = new Date(window.startsAt).getTime()
  const endsAt = window.endsAt ? new Date(window.endsAt).getTime() : Number.POSITIVE_INFINITY
  return startsAt <= now && now < endsAt
}

function isWindowScheduled(window: MaintenanceWindowConfig | null): boolean {
  if (!window?.enabled) return false
  return new Date(window.startsAt).getTime() > Date.now()
}

function getApiMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message
  }
  return fallback
}

export default function AdminManutencaoPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [windowConfig, setWindowConfig] = useState<MaintenanceWindowConfig | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [authLoading, isAdmin, router])

  const active = useMemo(() => isWindowActive(windowConfig), [windowConfig])
  const scheduled = useMemo(() => isWindowScheduled(windowConfig), [windowConfig])
  const inactive = !windowConfig?.enabled
  const lastAudit = auditEvents[0] ?? null

  const hydrateForm = useCallback((nextWindow: MaintenanceWindowConfig | null) => {
    setForm({
      reason: nextWindow?.reason || EMPTY_FORM.reason,
      message: nextWindow?.message || EMPTY_FORM.message,
      severity: nextWindow?.severity || EMPTY_FORM.severity,
      startsAt: toDateTimeLocal(nextWindow?.startsAt) || EMPTY_FORM.startsAt,
      endsAt: toDateTimeLocal(nextWindow?.endsAt),
    })
  }, [])

  const loadState = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionLoading((current) => current ?? 'refresh')
    try {
      const [windowRes, auditRes] = await Promise.all([
        fetch('/api/v1/admin/maintenance/window', { cache: 'no-store' }),
        fetch('/api/v1/admin/audit-log?resource=maintenance_window&limit=5', {
          cache: 'no-store',
        }),
      ])

      const windowJson = await windowRes.json().catch(() => null)
      if (!windowRes.ok) {
        throw new Error(getApiMessage(windowJson, 'Não foi possível carregar a janela.'))
      }

      const nextWindow = (windowJson?.data?.window ?? null) as MaintenanceWindowConfig | null
      setWindowConfig(nextWindow)
      hydrateForm(nextWindow)

      if (auditRes.ok) {
        const auditJson = await auditRes.json().catch(() => null)
        setAuditEvents(Array.isArray(auditJson?.data) ? auditJson.data : [])
      } else {
        setAuditEvents([])
      }

      setLastLoadedAt(new Date().toISOString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao carregar manutenção.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
      setActionLoading(null)
    }
  }, [hydrateForm])

  useEffect(() => {
    if (!authLoading && isAdmin) void loadState()
  }, [authLoading, isAdmin, loadState])

  async function saveWindow(enabled: boolean, action: ActionKey, successMessage: string) {
    setActionLoading(action)
    setError(null)
    try {
      const startsAt = toIso(form.startsAt) ?? new Date().toISOString()
      const endsAt = form.endsAt ? toIso(form.endsAt) ?? null : null
      const res = await fetch('/api/v1/admin/maintenance/window', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          reason: form.reason,
          message: form.message,
          severity: form.severity,
          startsAt,
          endsAt,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(getApiMessage(json, 'Não foi possível salvar a janela.'))

      const nextWindow = json.data.window as MaintenanceWindowConfig
      setWindowConfig(nextWindow)
      hydrateForm(nextWindow)
      toast.success(successMessage)
      await loadState()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao salvar manutenção.'
      setError(message)
      toast.error(message)
    } finally {
      setActionLoading(null)
    }
  }

  async function cancelWindow() {
    setActionLoading('cancel')
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/maintenance/window', { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(getApiMessage(json, 'Não foi possível cancelar a janela.'))
      setWindowConfig(null)
      hydrateForm(null)
      toast.success('Janela de manutenção cancelada.')
      await loadState()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao cancelar manutenção.'
      setError(message)
      toast.error(message)
    } finally {
      setActionLoading(null)
    }
  }

  async function publishBanner() {
    setActionLoading('publish')
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/maintenance/banner/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: form.message,
          severity: form.severity,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(getApiMessage(json, 'Não foi possível publicar o banner.'))
      const nextWindow = json.data.window as MaintenanceWindowConfig
      setWindowConfig(nextWindow)
      hydrateForm(nextWindow)
      toast.success('Banner de manutenção publicado.')
      await loadState()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao publicar banner.'
      setError(message)
      toast.error(message)
    } finally {
      setActionLoading(null)
    }
  }

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-maintenance-page" className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manutenção</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle a janela operacional, o banner público e o impacto para usuários.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadState()}
          disabled={loading || actionLoading !== null}
          data-testid="maintenance-refresh-button"
        >
          <RefreshCw className={cn((loading || actionLoading === 'refresh') && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {loading && !windowConfig ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]" aria-busy="true">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : error && !windowConfig ? (
        <Card className="border-destructive/40 bg-destructive/5" data-testid="maintenance-error">
          <CardContent className="space-y-4 py-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium text-destructive">{error}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente novamente antes de alterar o estado da manutenção.
              </p>
            </div>
            <Button variant="outline" onClick={() => void loadState()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card size="sm">
              <CardContent className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-lg p-2',
                    active
                      ? 'bg-destructive/10 text-destructive'
                      : scheduled
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700',
                  )}
                  aria-hidden="true"
                >
                  {active ? <ShieldAlert /> : scheduled ? <CalendarClock /> : <CheckCircle2 />}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {active ? 'Ativa agora' : scheduled ? 'Agendada' : 'Inativa'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
                  <Megaphone />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Banner</p>
                  <p className="font-medium">
                    {windowConfig?.bannerPublishedAt
                      ? `Publicado em ${formatDate(windowConfig.bannerPublishedAt)}`
                      : 'Não publicado'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex items-center gap-3">
                <div className="rounded-lg bg-secondary p-2 text-secondary-foreground" aria-hidden="true">
                  <History />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Último evento</p>
                  <p className="font-medium">{lastAudit?.action ?? 'Sem audit event'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Janela de manutenção</CardTitle>
                <CardDescription>
                  Defina mensagem, severidade, início e fim. Cada ação exibe feedback visual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-reason">Motivo</Label>
                    <Input
                      id="maintenance-reason"
                      value={form.reason}
                      maxLength={160}
                      onChange={(event) => setField('reason', event.target.value)}
                      placeholder="Atualização programada"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-severity">Severidade</Label>
                    <select
                      id="maintenance-severity"
                      value={form.severity}
                      onChange={(event) =>
                        setField('severity', event.target.value as MaintenanceSeverity)
                      }
                      className="h-11 min-h-[44px] w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="info">Informativo</option>
                      <option value="warning">Atenção</option>
                      <option value="critical">Crítico</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maintenance-message">Mensagem pública</Label>
                  <textarea
                    id="maintenance-message"
                    value={form.message}
                    maxLength={500}
                    onChange={(event) => setField('message', event.target.value)}
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="Estamos em manutenção. Voltamos em instantes."
                  />
                  <p className="text-xs text-muted-foreground">{form.message.length}/500 caracteres</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-starts-at">Início</Label>
                    <Input
                      id="maintenance-starts-at"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => setField('startsAt', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-ends-at">Fim opcional</Label>
                    <Input
                      id="maintenance-ends-at"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => setField('endsAt', event.target.value)}
                    />
                  </div>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void saveWindow(true, 'activate', 'Janela de manutenção ativada.')}
                    disabled={actionLoading !== null || !form.reason.trim() || !form.message.trim()}
                  >
                    {actionLoading === 'activate' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <PlayCircle />
                    )}
                    Ativar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void saveWindow(true, 'schedule', 'Janela de manutenção agendada.')}
                    disabled={actionLoading !== null || !form.startsAt || !form.reason.trim() || !form.message.trim()}
                  >
                    {actionLoading === 'schedule' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <CalendarClock />
                    )}
                    Agendar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void saveWindow(false, 'deactivate', 'Janela de manutenção desativada.')}
                    disabled={actionLoading !== null || inactive}
                  >
                    {actionLoading === 'deactivate' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <PauseCircle />
                    )}
                    Desativar
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void publishBanner()}
                    disabled={actionLoading !== null || !windowConfig?.enabled}
                  >
                    {actionLoading === 'publish' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Megaphone />
                    )}
                    Publicar banner
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void cancelWindow()}
                    disabled={actionLoading !== null || inactive}
                  >
                    {actionLoading === 'cancel' ? <Loader2 className="animate-spin" /> : <XCircle />}
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Preview do banner</CardTitle>
                  <CardDescription>Como a mensagem aparece para o público durante a janela.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={cn(
                      'rounded-lg border p-4',
                      form.severity === 'critical'
                        ? 'border-destructive/40 bg-destructive/5'
                        : form.severity === 'warning'
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-primary/20 bg-primary/5',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Manutenção
                      </div>
                      <Badge variant={SEVERITY_BADGE_VARIANT[form.severity]}>
                        {SEVERITY_LABELS[form.severity]}
                      </Badge>
                    </div>
                    <p className="text-sm">{form.message || 'Mensagem pública do banner.'}</p>
                    <p className="mt-3 text-xs opacity-80">
                      {form.endsAt ? `Previsão de fim: ${formatDate(toIso(form.endsAt))}` : 'Sem previsão de fim.'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Impacto</CardTitle>
                  <CardDescription>Resumo operacional da janela configurada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="font-medium">
                        {active
                          ? 'Usuários serão direcionados para /manutencao.'
                          : scheduled
                            ? 'Usuários serão impactados no horário agendado.'
                            : 'Sem bloqueio de navegação ativo.'}
                      </p>
                      <p className="text-muted-foreground">
                        Início: {formatDate(windowConfig?.startsAt)}. Fim: {formatDate(windowConfig?.endsAt)}.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Megaphone className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="font-medium">
                        {windowConfig?.bannerPublishedAt
                          ? 'Banner público publicado.'
                          : 'Banner ainda não publicado.'}
                      </p>
                      <p className="text-muted-foreground">
                        Atualize o banner após mudar mensagem ou severidade.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>
                Últimos eventos de auditoria para manutenção. Última leitura: {formatDate(lastLoadedAt)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum audit event registrado para manutenção.
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {auditEvents.map((event) => (
                    <div
                      key={event.id}
                      className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium">{event.action}</p>
                        <p className="text-muted-foreground">
                          {event.user?.email ?? event.userId ?? 'sistema'} - {event.ipAddress ?? 'IP não informado'}
                        </p>
                      </div>
                      <time className="text-xs text-muted-foreground md:text-right">
                        {formatDate(event.createdAt)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
