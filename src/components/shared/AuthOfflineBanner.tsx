'use client'

/**
 * TASK-18/ST002 (CL-028): banner quando Supabase Auth esta offline.
 * Polling em /api/health?service=supabase a cada 60s (pausa com Page Visibility).
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

type State = 'ok' | 'degraded' | 'unknown'

export function AuthOfflineBanner() {
  const [state, setState] = useState<State>('unknown')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const check = async () => {
      if (document.hidden) return
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 4_000)
        const res = await fetch('/api/health?service=supabase', { cache: 'no-store', signal: ctrl.signal })
        clearTimeout(t)
        if (cancelled) return
        setState(res.ok ? 'ok' : 'degraded')
      } catch {
        if (!cancelled) setState('degraded')
      }
    }

    void check()
    timer = setInterval(check, 60_000)
    const onVis = () => {
      if (!document.hidden) void check()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (state !== 'degraded') return null

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="auth-offline-banner"
      className="fixed inset-x-0 top-0 z-[59] border-b border-destructive bg-destructive text-destructive-foreground shadow-sm"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-medium">
          Serviço de autenticação indisponível — novo login e recuperação de senha podem falhar.
        </p>
      </div>
    </div>
  )
}
