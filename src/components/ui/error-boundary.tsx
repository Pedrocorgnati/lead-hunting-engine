'use client'
import React from 'react'
import { Button } from './button'

interface ErrorBoundaryState { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-destructive font-medium">Algo deu errado</p>
          <p className="text-sm text-muted-foreground mt-1">{this.state.error?.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
