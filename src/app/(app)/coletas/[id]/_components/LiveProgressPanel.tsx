'use client'

import { useEffect, useState, useCallback } from 'react'
import { collectionLiveStatus, formatLastUpdated } from '@/lib/live-status'
import type { CollectionJobStatus } from '@/lib/constants/enums'
import { getJobStatus } from '@/actions/jobs'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, CheckCircle2, Circle } from 'lucide-react'

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
  const [status, setStatus] = useState<CollectionJobStatus>(initialStatus)
  const [progress, setProgress] = useState(initialProgress)
  const [resultCount, setResultCount] = useState(initialResultCount)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt ?? null)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(initialErrorMessage)
  const [isPolling, setIsPolling] = useState(false)

  const live = collectionLiveStatus(status, updatedAt)

  const poll = useCallback(async () => {
    if (isPolling) return
    setIsPolling(true)
    try {
      const data = await getJobStatus(jobId)
      if (data) {
        setStatus(data.status)
        setProgress(data.progress)
        setResultCount(data.resultCount)
        setUpdatedAt(data.updatedAt ?? null)
        setErrorMessage(data.errorMessage)
      }
    } catch {
      // Silencioso: retry sera feito pelo interval
    } finally {
      setIsPolling(false)
    }
  }, [jobId, isPolling])

  useEffect(() => {
    // Nao poll se ja esta em estado terminal
    const terminalStatuses: CollectionJobStatus[] = ['COMPLETED', 'FAILED', 'FAILED_TERMINAL', 'CANCELLED', 'PARTIAL']
    if (terminalStatuses.includes(status)) return

    const intervalMs = live.pollAfter > 0 ? live.pollAfter : 5000
    const timer = setInterval(poll, intervalMs)
    return () => clearInterval(timer)
  }, [status, live.pollAfter, poll])

  // Retry manual em caso de erro
  const handleRetry = useCallback(() => {
    setTimeout(poll, live.retryAfterMs)
  }, [poll, live.retryAfterMs])

  const timelineSteps = [
    { label: 'Criado', date: null, done: true },
    { label: 'Iniciado', date: initialStartedAt ?? null, done: !!initialStartedAt },
    { label: 'Finalizado', date: initialCompletedAt ?? null, done: !!initialCompletedAt },
  ]

  return (
    <div className="space-y-4">
      {/* aria-live region para leitores de tela */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
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

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}
