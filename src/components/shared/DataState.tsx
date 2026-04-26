'use client'

/**
 * TASK-18/ST006 (CL-384): componente padronizado para renderizar estados
 * loading / empty / error / partial / success sobre um dataset.
 * Unifica UX para nao cada componente reimplementar skeleton + empty.
 */
import type { ReactNode } from 'react'
import { Loader2, AlertCircle, Info } from 'lucide-react'

export type DataStateStatus = 'loading' | 'empty' | 'error' | 'partial' | 'success'

interface DataStateProps {
  status: DataStateStatus
  loading?: ReactNode
  empty?: ReactNode
  error?: ReactNode
  partialMessage?: string
  errorMessage?: string
  onRetry?: () => void
  children: ReactNode
}

export function DataState({
  status,
  loading,
  empty,
  error,
  partialMessage = 'Dados parciais: ainda atualizando em segundo plano.',
  errorMessage = 'Não foi possível carregar os dados.',
  onRetry,
  children,
}: DataStateProps) {
  if (status === 'loading') {
    return loading !== undefined ? (
      <>{loading}</>
    ) : (
      <div
        role="status"
        className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        data-testid="data-state-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando…
      </div>
    )
  }

  if (status === 'empty') {
    return empty !== undefined ? (
      <>{empty}</>
    ) : (
      <div
        className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        data-testid="data-state-empty"
      >
        Nenhum dado encontrado.
      </div>
    )
  }

  if (status === 'error') {
    return error !== undefined ? (
      <>{error}</>
    ) : (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive"
        data-testid="data-state-error"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p>{errorMessage}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-sm underline underline-offset-2"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'partial') {
    return (
      <>
        <div
          role="status"
          className="mb-3 rounded-md border border-[--color-warning] bg-[--color-warning]/10 px-3 py-2 text-xs text-[--color-warning]"
          data-testid="data-state-partial-banner"
        >
          <div className="flex items-center gap-2">
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>{partialMessage}</span>
          </div>
        </div>
        {children}
      </>
    )
  }

  return <>{children}</>
}
