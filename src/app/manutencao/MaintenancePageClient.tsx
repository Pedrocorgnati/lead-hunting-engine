'use client'

import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, ExternalLink, Info, RefreshCw } from 'lucide-react'
import { usePublicMaintenanceWindow } from '@/components/MaintenanceBanner'
import { Button } from '@/components/ui/button'
import {
  formatMaintenanceCountdown,
  formatMaintenancePeriod,
  MAINTENANCE_STATUS_URL,
  type MaintenanceSeverity,
} from '@/lib/public-maintenance-window'
import { cn } from '@/lib/utils'

const severityStyles: Record<MaintenanceSeverity, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-950 dark:text-sky-50',
  warning:
    'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-50',
  critical:
    'border-red-200 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-950 dark:text-red-50',
}

const severityLabels: Record<MaintenanceSeverity, string> = {
  info: 'Informação',
  warning: 'Atenção',
  critical: 'Crítico',
}

export function MaintenancePageClient() {
  const { status, window: maintenanceWindow, error, reload } = usePublicMaintenanceWindow()

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-2xl items-center justify-center">
        <div className="w-full text-center">
          {status === 'loading' ? <LoadingState /> : null}
          {status === 'inactive' ? <InactiveState /> : null}
          {status === 'error' ? <ErrorState error={error} onRetry={reload} /> : null}
          {status === 'active' && maintenanceWindow ? (
            <ActiveState
              message={maintenanceWindow.message}
              reason={maintenanceWindow.reason}
              severity={maintenanceWindow.severity}
              period={formatMaintenancePeriod(maintenanceWindow)}
              countdown={formatMaintenanceCountdown(maintenanceWindow.endsAt)}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}

function LoadingState() {
  return (
    <StatusShell
      icon={<RefreshCw className="h-8 w-8 animate-spin" aria-hidden="true" />}
      title="Carregando status"
      description="Consultando a janela de manutenção publicada."
    />
  )
}

function InactiveState() {
  return (
    <StatusShell
      icon={<Info className="h-8 w-8" aria-hidden="true" />}
      title="Sem manutenção ativa"
      description="Não há janela de manutenção publicada neste momento."
    />
  )
}

function ErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <StatusShell
      icon={<AlertTriangle className="h-8 w-8" aria-hidden="true" />}
      title="Não foi possível carregar a janela"
      description={error ?? 'Tente novamente para consultar o status mais recente.'}
      action={
        <Button type="button" onClick={onRetry} className="mt-6">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      }
    />
  )
}

function ActiveState({
  message,
  reason,
  severity,
  period,
  countdown,
}: {
  message: string
  reason: string
  severity: MaintenanceSeverity
  period: string
  countdown: string | null
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('rounded-lg border p-6 text-left shadow-sm', severityStyles[severity])}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/70 dark:bg-white/10">
          <SeverityIcon severity={severity} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-normal">
            {severityLabels[severity]}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            {message}
          </h1>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium">Motivo</dt>
              <dd className="mt-1 opacity-85">{reason}</dd>
            </div>
            <div>
              <dt className="font-medium">Janela</dt>
              <dd className="mt-1 opacity-85">{period}</dd>
            </div>
            {countdown ? (
              <div>
                <dt className="font-medium">Tempo estimado</dt>
                <dd className="mt-1 opacity-85" aria-live="polite">
                  {countdown}
                </dd>
              </div>
            ) : null}
          </dl>
          <a
            href={MAINTENANCE_STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Acompanhar status em nova aba"
          >
            Acompanhar status
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  )
}

function SeverityIcon({ severity }: { severity: MaintenanceSeverity }) {
  if (severity === 'critical') {
    return <AlertCircle className="h-6 w-6" aria-hidden="true" />
  }

  if (severity === 'warning') {
    return <AlertTriangle className="h-6 w-6" aria-hidden="true" />
  }

  return <Info className="h-6 w-6" aria-hidden="true" />
}

function StatusShell({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  )
}
