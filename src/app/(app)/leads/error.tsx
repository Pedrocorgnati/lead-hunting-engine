'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div data-testid="leads-error" className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden={true} />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">Erro ao carregar leads</p>
        <p className="text-sm text-muted-foreground">Ocorreu um erro inesperado. Por favor, tente novamente.</p>
        {error.digest && <p className="text-xs text-muted-foreground font-mono">ID: {error.digest}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  )
}
