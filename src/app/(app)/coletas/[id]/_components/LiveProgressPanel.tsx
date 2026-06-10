'use client'

import { collectionLiveStatus, formatLastUpdated, type CollectionStatus } from '@/lib/live-status'
import { useLivePoll } from '@/lib/live/use-live-poll'
import type { CollectionJobStatus } from '@/lib/constants/enums'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Circle, RotateCw } from 'lucide-react'

/**
 * LiveProgressPanel (A5) — agora no contrato live canonico (item 048):
 * consome GET /api/v1/collections/:id/progress via useLivePoll (B22.1),
 * que honra live.pollAfter/retryAfterMs do servidor, para em estado
 * terminal e expoe erro de poll com retry manual (sem silencio).
 */
interface LiveProgressPanelProps {
  jobId: string
  initialStatus: CollectionJobStatus
  initialProgress: number
  initialResultCount: number
  initialMaxResults: number
  initialUpdatedAt?: string
  initialErrorMessage?: string
  initialStartedAt?: string | null
  initialCompletedAt?: string | null
}

interface ProgressPayload {
  id: string
  status: CollectionStatus
  progress: number
  resultCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  live: { pollAfter: number; retryAfterMs: number; lastUpdatedAt: string | null }
}

export function LiveProgressPanel({
  jobId,
  initialStatus,
  initialProgress,
  initialResultCount,
  initialMaxResults,
  initialUpdatedAt,
  initialErrorMessage,
  initialStartedAt,
  initialCompletedAt,
}: LiveProgressPanelProps) {
  const initialTerminal = ['COMPLETED', 'FAILED', 'FAILED_TERMINAL', 'CANCELLED', 'PARTIAL'].includes(initialStatus)

  const { data, error, refresh } = useLivePoll<ProgressPayload>(
    `/api/v1/collections/${jobId}/progress`,
    { intervalMs: 5_000, enabled: !initialTerminal },
  )

  const status = (data?.status ?? initialStatus) as CollectionStatus
  const progress = data?.progress ?? initialProgress
  const resultCount = data?.resultCount ?? initialResultCount
  const updatedAt = data?.live.lastUpdatedAt ?? initialUpdatedAt ?? null
  const errorMessage = data?.errorMessage ?? initialErrorMessage
  const startedAt = data?.startedAt ?? initialStartedAt ?? null
  const completedAt = data?.completedAt ?? initialCompletedAt ?? null

  const live = collectionLiveStatus(status, updatedAt)

  const timelineSteps = [
    { label: 'Criado', date: null, done: true },
    { label: 'Iniciado', date: startedAt, done: !!startedAt },
    { label: 'Finalizado', date: completedAt, done: !!completedAt },
  ]

  return (
    <div className="space-y-4">
      {/* aria-live region para leitores de tela */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {live.ariaLiveMessage}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Leads coletados</span>
          <span className="font-medium">{resultCount} / {initialMaxResults}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Mini-timeline */}
      <div className="flex items-start gap-0">
        {timelineSteps.map((step, idx) => (
          <div key={step.label} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={`flex-1 h-px ${step.done ? 'bg-foreground' : 'bg-muted'}`} />
              )}
              <div className="shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-foreground" aria-hidden="true" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              {idx < timelineSteps.length - 1 && (
                <div className={`flex-1 h-px ${timelineSteps[idx + 1]?.done ? 'bg-foreground' : 'bg-muted'}`} />
              )}
            </div>
            <div className="mt-1 text-center">
              <p className="text-xs font-medium">{step.label}</p>
              <p className="text-xs text-muted-foreground">
                {step.date
                  ? new Date(step.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{live.statusLabel}</span>
        <span>{formatLastUpdated(updatedAt)}</span>
      </div>

      {/* Erro de POLL (rede/HTTP) — visivel, com retry manual imediato */}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Falha ao atualizar o progresso: {error}
          </span>
          <Button size="sm" variant="outline" onClick={() => void refresh()} data-testid="progress-retry-btn">
            <RotateCw className="h-3 w-3 mr-1" aria-hidden="true" />
            Tentar agora
          </Button>
        </div>
      )}

      {/* Erro da COLETA em si */}
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}
