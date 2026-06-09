'use client'
import React from 'react'
import { AlertTriangle, Copy, RotateCcw, Send } from 'lucide-react'
import { Button } from './button'

interface ErrorBoundaryState {
  hasError: boolean
  correlationId: string
  copied: boolean
  reportStatus: 'idle' | 'sending' | 'sent' | 'failed'
}

function createCorrelationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    correlationId: '',
    copied: false,
    reportStatus: 'idle',
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      correlationId: createCorrelationId(),
      copied: false,
      reportStatus: 'idle',
    }
  }

  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', {
        correlationId: this.state.correlationId,
        name: error.name,
      })
    }
  }

  private reset = () => {
    this.setState({
      hasError: false,
      correlationId: '',
      copied: false,
      reportStatus: 'idle',
    })
  }

  private copyCorrelationId = async () => {
    if (!this.state.correlationId) return
    try {
      await navigator.clipboard.writeText(this.state.correlationId)
      this.setState({ copied: true })
    } catch {
      this.setState({ copied: false })
    }
  }

  private reportError = async () => {
    if (!this.state.correlationId || this.state.reportStatus === 'sending') return

    this.setState({ reportStatus: 'sending' })
    try {
      const response = await fetch('/api/v1/errors/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          correlationId: this.state.correlationId,
          boundary: 'ui.error-boundary',
          pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          occurredAt: new Date().toISOString(),
        }),
      })
      this.setState({ reportStatus: response.ok ? 'sent' : 'failed' })
    } catch {
      this.setState({ reportStatus: 'failed' })
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-card px-4 py-10 text-center"
        >
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="size-6 text-destructive" aria-hidden={true} />
          </div>
          <div className="max-w-md space-y-2">
            <p className="font-medium text-foreground">Algo deu errado</p>
            <p className="text-sm text-muted-foreground">
              Ocorreu uma falha inesperada. Tente novamente ou reporte este incidente para
              investigacao.
            </p>
            <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
              Correlation ID: {this.state.correlationId}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={this.copyCorrelationId}>
              <Copy aria-hidden={true} />
              {this.state.copied ? 'ID copiado' : 'Copiar ID'}
            </Button>
            <Button
              variant="outline"
              onClick={this.reportError}
              disabled={this.state.reportStatus === 'sending'}
            >
              <Send aria-hidden={true} />
              {this.state.reportStatus === 'sending' ? 'Reportando...' : 'Reportar'}
            </Button>
            <Button onClick={this.reset}>
              <RotateCcw aria-hidden={true} />
              Tentar novamente
            </Button>
          </div>
          {this.state.reportStatus === 'sent' && (
            <p className="text-xs text-muted-foreground">Incidente reportado com sucesso.</p>
          )}
          {this.state.reportStatus === 'failed' && (
            <p className="text-xs text-destructive">
              Nao foi possivel reportar agora. Copie o ID e tente novamente mais tarde.
            </p>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
