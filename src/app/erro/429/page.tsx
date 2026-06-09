'use client'

import { useEffect, useId, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Clock3, Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_RETRY_AFTER } from '@/lib/constants'
import { reportErrorPage } from '@/lib/report-error-page'

function formatSeconds(s: number): string {
  if (s <= 0) return '0s'
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function RateLimitCountdown() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const liveRegionId = useId()

  const retryAtParam = searchParams.get('retryAt')
  const retryAfterParam = searchParams.get('retryAfter')

  // Ordem de precedencia para a janela de bloqueio:
  //  1. `retryAt` (timestamp absoluto de liberacao)
  //  2. `retryAfter` (segundos relativos, espelho do header HTTP `Retry-After`)
  //  3. fallback DEFAULT_RETRY_AFTER quando a resposta 429 nao traz `Retry-After`
  // Calculado UMA vez via inicializador lazy de useState: `Date.now()` e impuro
  // e nao pode rodar no corpo do render (react-hooks/purity); alem disso fixar
  // o alvo no mount evita drift do timestamp relativo a cada re-render.
  const [targetMs] = useState(() =>
    retryAtParam
      ? new Date(retryAtParam).getTime()
      : retryAfterParam
        ? Date.now() + parseInt(retryAfterParam, 10) * 1000
        : Date.now() + DEFAULT_RETRY_AFTER * 1000,
  )

  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)))
  // `blocked` e derivado de `remaining` (nao precisa ser estado proprio): evita
  // setState sincrono dentro do effect (react-hooks/set-state-in-effect) e
  // mantem botao/countdown sempre coerentes com o tempo restante.
  const blocked = remaining > 0

  // Reporta o 429 ao endpoint canonico no mount (best-effort, falha por ambiente).
  useEffect(() => {
    void reportErrorPage('app.rate-limit-page')
  }, [])

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [targetMs, remaining])

  return (
    <div className="flex flex-col items-center gap-6">
      <Clock3 className="h-12 w-12 text-muted-foreground" aria-hidden="true" />

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Limite de requisicoes atingido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Voce fez muitas requisicoes em pouco tempo. Aguarde o temporizador antes de tentar novamente.
        </p>
      </div>

      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="rounded-lg border bg-muted px-6 py-3 text-center"
      >
        {blocked ? (
          <p className="text-lg font-mono font-semibold tabular-nums" data-testid="countdown">
            {formatSeconds(remaining)}
          </p>
        ) : (
          <p className="text-sm font-medium text-emerald-600">Pronto! Voce pode tentar novamente.</p>
        )}
      </div>

      <Button
        type="button"
        disabled={blocked}
        onClick={() => router.back()}
        aria-disabled={blocked}
        data-testid="retry-button"
        className="flex items-center gap-2"
      >
        {blocked ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
        )}
        {blocked ? `Aguarde ${formatSeconds(remaining)}` : 'Tentar novamente'}
      </Button>
    </div>
  )
}

export default function Error429Page() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-4"
      aria-labelledby="error-429-title"
    >
      <span id="error-429-title" className="sr-only">
        Limite de requisicoes atingido
      </span>
      <Suspense
        fallback={
          <div className="flex justify-center py-8" aria-label="Carregando...">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        }
      >
        <RateLimitCountdown />
      </Suspense>
    </main>
  )
}
