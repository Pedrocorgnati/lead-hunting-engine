'use client'

/**
 * Task 25 / A15.4 (loop 05-27-lead-hunting-engine-explained):
 * InlineRecoveryPanel - painel de recuperacao operacional para erros de provider.
 *
 * Renderiza, a partir do health operacional de UM provider (resposta de
 * GET /api/v1/admin/providers/status), os campos canonicos de status
 * (status, latencyMs, quotaRemaining, rateLimitResetAt, lastError,
 * fallbackProvider, updatedAt) e as acoes de recuperacao contextuais para as
 * quatro classes de falha: credencial invalida, quota esgotada, rate-limit e
 * provider fora do ar (PAUSED/DOWN).
 *
 * Acoes reais (sem orfaos, sem silencio):
 *  - Testar credencial -> POST /api/v1/admin/config/credentials/:provider/test
 *  - Abrir jobs filtrados -> /admin/jobs/fila (destino real, sem deadend)
 *  - Pausar / Retomar provider -> POST /api/v1/admin/providers/:provider/{pause,resume}
 *  - Acionar fallback -> POST /api/v1/admin/providers/:provider/force-fallback
 *
 * Operacoes sensiveis (pause/resume/force-fallback) exigem reautenticacao: o
 * painel obtem um reauthId via POST /api/v1/auth/reauth com o escopo exato
 * `admin.providers:<source>:<operation>` antes de chamar a operacao, conforme o
 * contrato de _provider-operations.ts (A15.3). Toda acao gera um correlationId
 * proprio e expoe loading, sucesso e erro com regiao aria-live.
 *
 * Telas alvo: AD6 /admin/credenciais, AD7 teste de credencial,
 * AD19 /admin/provedores, G15, G16.
 */

import { useId, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Loader2,
  PauseCircle,
  PlayCircle,
  Shuffle,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'

type ProviderStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED'

/**
 * Espelha o ProviderHealthItem de GET /api/v1/admin/providers/status. Mantido
 * local porque o tipo da rota nao e exportado; os campos sao o contrato de
 * aceite desta task (status + 6 metricas + updatedAt).
 */
export interface ProviderHealth {
  source: string
  label: string
  status: ProviderStatus
  latencyMs: number | null
  quotaRemaining: number | null
  rateLimitResetAt: string | null
  lastError: string | null
  fallbackProvider: string | null
  updatedAt: string
}

export interface InlineRecoveryPanelProps {
  health: ProviderHealth
  /** Disparado apos uma acao de recuperacao bem-sucedida, para o pai recarregar o status. */
  onRecovered?: (correlationId: string) => void
  className?: string
}

type SensitiveOperation = 'pause' | 'resume' | 'force-fallback'

interface ActionFeedback {
  tone: 'success' | 'error'
  message: string
  correlationId: string
}

const STATUS_BADGE: Record<ProviderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  UP: { label: 'Operacional', variant: 'secondary' },
  DEGRADED: { label: 'Degradado', variant: 'outline' },
  DOWN: { label: 'Fora do ar', variant: 'destructive' },
  PAUSED: { label: 'Pausado', variant: 'destructive' },
}

const OPERATION_LABEL: Record<SensitiveOperation, string> = {
  pause: 'Pausar provider',
  resume: 'Retomar provider',
  'force-fallback': 'Acionar fallback',
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${value}${suffix}`
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

/** Extrai a mensagem de erro do envelope canonico { error: { code, message } }. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body?.error?.message) {
      return body.error.code ? `${body.error.message} (${body.error.code})` : body.error.message
    }
  } catch {
    // corpo nao-JSON: cai no fallback
  }
  return fallback
}

export function InlineRecoveryPanel({ health, onRecovered, className }: InlineRecoveryPanelProps) {
  const toast = useToast()
  const liveRegionId = useId()

  const [activeOperation, setActiveOperation] = useState<SensitiveOperation | null>(null)
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const now = Date.now()

  const conditions = useMemo(() => {
    const rateLimitResetMs = health.rateLimitResetAt ? new Date(health.rateLimitResetAt).getTime() : null
    const isRateLimited = rateLimitResetMs !== null && !Number.isNaN(rateLimitResetMs) && rateLimitResetMs > now
    const isQuotaExhausted = health.quotaRemaining !== null && health.quotaRemaining <= 0
    const isPaused = health.status === 'PAUSED'
    const isDown = health.status === 'DOWN'
    const credentialInvalid =
      isPaused ||
      (!!health.lastError && /credential|credenc|unauthor|invalid|api[\s_-]?key|401|403/i.test(health.lastError))
    const hasIssue =
      isPaused || isDown || isRateLimited || isQuotaExhausted || credentialInvalid || health.status === 'DEGRADED'
    return { isRateLimited, isQuotaExhausted, isPaused, isDown, credentialInvalid, hasIssue }
  }, [health, now])

  function announce(next: ActionFeedback) {
    setFeedback(next)
    if (next.tone === 'success') toast.success(next.message)
    else toast.error(`${next.message} · ref ${next.correlationId}`)
  }

  /** Testar credencial (AD7) - nao exige reautenticacao. */
  async function handleTestCredential() {
    const correlationId = crypto.randomUUID()
    setBusyAction('test')
    setFeedback(null)
    try {
      const res = await fetch(`/api/v1/admin/config/credentials/${encodeURIComponent(health.source)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify({ correlationId }),
      })
      if (!res.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(res, 'Falha ao testar credencial.'),
        })
        return
      }
      const body = (await res.json()) as { data?: { ok?: boolean; message?: string } }
      const ok = body?.data?.ok !== false
      if (ok) {
        announce({ tone: 'success', correlationId, message: `Credencial de ${health.label} validada com sucesso.` })
        onRecovered?.(correlationId)
      } else {
        announce({
          tone: 'error',
          correlationId,
          message: body?.data?.message ?? `Credencial de ${health.label} invalida ou expirada.`,
        })
      }
    } catch {
      announce({ tone: 'error', correlationId, message: 'Erro de rede ao testar credencial.' })
    } finally {
      setBusyAction(null)
    }
  }

  function openOperation(operation: SensitiveOperation) {
    setActiveOperation(operation)
    setReason('')
    setPassword('')
    setFeedback(null)
  }

  function closeOperation() {
    setActiveOperation(null)
    setReason('')
    setPassword('')
  }

  /** Executa uma operacao sensivel: reautentica (escopo exato) e chama a rota. */
  async function handleSensitiveOperation(event: FormEvent) {
    event.preventDefault()
    if (!activeOperation) return
    const operation = activeOperation
    const correlationId = crypto.randomUUID()
    const scope = `admin.providers:${health.source}:${operation}`
    setBusyAction(operation)
    setFeedback(null)
    try {
      // 1) Reautenticacao escopada -> reauthId
      const reauthRes = await fetch('/api/v1/auth/reauth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, scope, correlationId }),
      })
      if (reauthRes.status === 429) {
        announce({ tone: 'error', correlationId, message: 'Muitas tentativas de reautenticacao. Aguarde um minuto.' })
        return
      }
      if (!reauthRes.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(reauthRes, 'Senha atual invalida.'),
        })
        return
      }
      const reauthBody = (await reauthRes.json()) as { data?: { reauthId?: string } }
      const reauthId = reauthBody?.data?.reauthId
      if (!reauthId) {
        announce({ tone: 'error', correlationId, message: 'Reautenticacao nao retornou sessao valida.' })
        return
      }

      // 2) Operacao no provider
      const opRes = await fetch(`/api/v1/admin/providers/${encodeURIComponent(health.source)}/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify({ reason: reason.trim(), reauthId, correlationId }),
      })
      if (!opRes.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(opRes, `Falha ao ${OPERATION_LABEL[operation].toLowerCase()}.`),
        })
        return
      }
      const successMessage =
        operation === 'pause'
          ? `${health.label} pausado. Coletas em andamento foram interrompidas.`
          : operation === 'resume'
            ? `${health.label} retomado e ativo novamente.`
            : `Fallback acionado para ${health.label}. Trafego redirecionado para ${health.fallbackProvider ?? 'o provider alternativo'}.`
      announce({ tone: 'success', correlationId, message: successMessage })
      closeOperation()
      onRecovered?.(correlationId)
    } catch {
      announce({ tone: 'error', correlationId, message: 'Erro de rede ao operar o provider.' })
    } finally {
      setBusyAction(null)
    }
  }

  const badge = STATUS_BADGE[health.status]
  const reasonValid = reason.trim().length >= 5
  const passwordValid = password.length >= 6
  const submitting = activeOperation !== null && busyAction === activeOperation

  return (
    <section
      data-testid={`inline-recovery-panel-${health.source}`}
      aria-label={`Recuperacao operacional de ${health.label}`}
      className={cn(
        'rounded-lg border p-4 space-y-4',
        conditions.hasIssue ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {conditions.hasIssue ? (
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          ) : null}
          <h3 className="text-sm font-semibold">{health.label}</h3>
          <Badge variant={badge.variant} data-testid={`recovery-status-${health.source}`}>
            {badge.label}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">Atualizado: {formatTimestamp(health.updatedAt)}</span>
      </header>

      {/* Bloco de status canonico (criterio de aceite: 7 campos sempre visiveis) */}
      <dl
        data-testid={`recovery-metrics-${health.source}`}
        className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"
      >
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">{health.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Latencia</dt>
          <dd className="font-medium">{formatNumber(health.latencyMs, ' ms')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quota restante</dt>
          <dd className="font-medium">{formatNumber(health.quotaRemaining)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rate-limit reseta em</dt>
          <dd className="font-medium">{formatTimestamp(health.rateLimitResetAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fallback</dt>
          <dd className="font-medium">{health.fallbackProvider ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ultimo erro</dt>
          <dd className="font-medium break-words" title={health.lastError ?? undefined}>
            {health.lastError ?? '—'}
          </dd>
        </div>
      </dl>

      {/* Sinalizacoes contextuais por classe de falha */}
      {conditions.hasIssue ? (
        <ul className="space-y-1 text-xs text-destructive" data-testid={`recovery-diagnostics-${health.source}`}>
          {conditions.credentialInvalid ? <li>Credencial invalida ou inativa: teste a credencial ou atualize em /admin/credenciais.</li> : null}
          {conditions.isQuotaExhausted ? <li>Quota esgotada: acione um provider de fallback para nao bloquear coletas.</li> : null}
          {conditions.isRateLimited ? <li>Rate-limit ativo ate {formatTimestamp(health.rateLimitResetAt)}.</li> : null}
          {conditions.isDown ? <li>Provider fora do ar: erros consecutivos detectados. Considere pausar e acionar fallback.</li> : null}
          {conditions.isPaused ? <li>Provider pausado: nenhuma coleta sera roteada ate retomar.</li> : null}
        </ul>
      ) : null}

      {/* Acoes de recuperacao */}
      <div className="flex flex-wrap gap-2" data-testid={`recovery-actions-${health.source}`}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTestCredential}
          disabled={busyAction !== null}
          data-testid={`recovery-test-credential-${health.source}`}
        >
          {busyAction === 'test' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Testar credencial
        </Button>

        {/* Destino real (sem deadend); o source vai como hint de filtro forward-compatible. */}
        <Link
          href={`/admin/jobs/fila?source=${encodeURIComponent(health.source)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          data-testid={`recovery-open-jobs-${health.source}`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Abrir jobs filtrados
        </Link>

        {conditions.isPaused ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => openOperation('resume')}
            disabled={busyAction !== null}
            data-testid={`recovery-resume-${health.source}`}
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Retomar provider
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => openOperation('pause')}
            disabled={busyAction !== null}
            data-testid={`recovery-pause-${health.source}`}
          >
            <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Pausar provider
          </Button>
        )}

        {health.fallbackProvider && !conditions.isPaused ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => openOperation('force-fallback')}
            disabled={busyAction !== null}
            data-testid={`recovery-force-fallback-${health.source}`}
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            Acionar fallback
          </Button>
        ) : null}
      </div>

      {/* Form de operacao sensivel: motivo + reautenticacao */}
      {activeOperation ? (
        <form
          onSubmit={handleSensitiveOperation}
          className="space-y-3 rounded-md border border-border bg-background p-3"
          data-testid={`recovery-operation-form-${health.source}`}
        >
          <p className="text-sm font-medium">{OPERATION_LABEL[activeOperation]} · confirme sua identidade</p>

          <label className="block text-xs font-medium">
            Motivo (minimo 5 caracteres)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={5}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid={`recovery-reason-${health.source}`}
            />
          </label>

          <label className="block text-xs font-medium">
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid={`recovery-password-${health.source}`}
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeOperation} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={activeOperation === 'resume' ? 'default' : 'destructive'}
              disabled={submitting || !reasonValid || !passwordValid}
              data-testid={`recovery-confirm-${health.source}`}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Confirmar
            </Button>
          </div>
        </form>
      ) : null}

      {/* Regiao de feedback acessivel (Zero Silencio): toda acao anuncia resultado */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        className={cn('min-h-[1rem] text-xs', feedback?.tone === 'error' ? 'text-destructive' : 'text-emerald-600')}
        data-testid={`recovery-feedback-${health.source}`}
      >
        {feedback ? `${feedback.message} (ref: ${feedback.correlationId})` : null}
      </div>
    </section>
  )
}
