'use client'

import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main data-testid="error-page" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center bg-background">
      <div className="rounded-full bg-destructive/10 p-6">
        <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden={true} />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
        <p className="text-muted-foreground max-w-sm">
          Ocorreu um erro inesperado. Por favor, tente novamente.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">ID: {error.digest}</p>
        )}
      </div>

      <button
        onClick={reset}
        data-testid="error-retry-button"
        className="px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Tentar novamente
      </button>
    </main>
  )
}
