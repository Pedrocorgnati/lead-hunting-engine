'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ExternalLink, Info, X } from 'lucide-react'
import {
  formatMaintenanceCountdown,
  formatMaintenancePeriod,
  getMaintenanceWindowSignature,
  isMaintenanceWindowExpired,
  MAINTENANCE_STATUS_URL,
  parsePublicMaintenanceWindowResponse,
  type MaintenanceSeverity,
  type PublicMaintenanceWindow,
} from '@/lib/public-maintenance-window'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'maintenanceBannerDismissed'

type MaintenanceStatus = 'loading' | 'inactive' | 'active' | 'error'

interface MaintenanceState {
  status: MaintenanceStatus
  window: PublicMaintenanceWindow | null
  error: string | null
}

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

export function usePublicMaintenanceWindow() {
  const [state, setState] = useState<MaintenanceState>({
    status: 'loading',
    window: null,
    error: null,
  })

  const load = useCallback(async () => {
    setState((current) => ({
      status: current.window ? current.status : 'loading',
      window: current.window,
      error: null,
    }))

    try {
      const response = await fetch('/api/v1/health/maintenance-window', {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Endpoint retornou HTTP ${response.status}.`)
      }

      const parsed = parsePublicMaintenanceWindowResponse(await response.json())

      if (!parsed.active || !parsed.window || isMaintenanceWindowExpired(parsed.window)) {
        setState({ status: 'inactive', window: null, error: null })
        return
      }

      setState({ status: 'active', window: parsed.window, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido.'
      if (process.env.NODE_ENV === 'development') {
        console.error('Falha ao carregar janela de manutenção.', error)
      }
      setState({ status: 'error', window: null, error: message })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: load }
}

export function MaintenanceBanner() {
  const { status, window: maintenanceWindow, reload } = usePublicMaintenanceWindow()
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(DISMISS_KEY)
  })
  const [now, setNow] = useState(() => Date.now())

  const signature = maintenanceWindow ? getMaintenanceWindowSignature(maintenanceWindow) : null
  const isDismissed = Boolean(signature && dismissedSignature === signature)
  const countdown = useMemo(
    () => (maintenanceWindow ? formatMaintenanceCountdown(maintenanceWindow.endsAt, now) : null),
    [maintenanceWindow, now],
  )

  useEffect(() => {
    if (!maintenanceWindow?.endsAt) return

    const interval = globalThis.setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)

      if (isMaintenanceWindowExpired(maintenanceWindow, nextNow)) {
        globalThis.clearInterval(interval)
        void reload()
      }
    }, 1000)

    return () => globalThis.clearInterval(interval)
  }, [maintenanceWindow, reload])

  const handleDismiss = () => {
    if (!signature) return
    window.sessionStorage.setItem(DISMISS_KEY, signature)
    setDismissedSignature(signature)
  }

  if (status !== 'active' || !maintenanceWindow || isDismissed) {
    return null
  }

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="maintenance-banner"
      className={cn('border-b px-4 py-3 shadow-sm', severityStyles[maintenanceWindow.severity])}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <SeverityIcon severity={maintenanceWindow.severity} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {severityLabels[maintenanceWindow.severity]}: {maintenanceWindow.message}
            </p>
            <p className="mt-1 text-sm opacity-85">
              {maintenanceWindow.reason} · {formatMaintenancePeriod(maintenanceWindow)}
            </p>
            {countdown ? (
              <p className="mt-1 text-sm font-medium" aria-live="polite">
                {countdown}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <a
            href={MAINTENANCE_STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Acompanhar status em nova aba"
          >
            Acompanhar status
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-white/10"
            aria-label="Fechar aviso de manutencao"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

function SeverityIcon({ severity }: { severity: MaintenanceSeverity }) {
  const className = 'mt-0.5 h-5 w-5 shrink-0'

  if (severity === 'critical') {
    return <AlertCircle className={className} aria-hidden="true" />
  }

  if (severity === 'warning') {
    return <AlertTriangle className={className} aria-hidden="true" />
  }

  return <Info className={className} aria-hidden="true" />
}
