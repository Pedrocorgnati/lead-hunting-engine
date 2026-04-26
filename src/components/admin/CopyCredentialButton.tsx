'use client'

/**
 * TASK-23 intake-review (CL-079): copia valor de credencial via opaque token.
 * NUNCA renderiza o valor no DOM nem faz console.log.
 * Fluxo:
 *   POST /api/v1/admin/config/credentials/[provider]/copy-token -> { token }
 *   GET  /api/v1/admin/config/credentials/[provider]/copy-token?t=<token> -> { value }
 *   navigator.clipboard.writeText(value) -> limpa referencia
 */
import { useEffect, useState } from 'react'
import { Copy, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'

interface CopyCredentialButtonProps {
  provider: string
  label?: string
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success' }
  | { kind: 'fallback'; value: string; countdownSec: number }

export function CopyCredentialButton({ provider, label = 'Copiar' }: CopyCredentialButtonProps) {
  const toast = useToast()
  const [state, setState] = useState<State>({ kind: 'idle' })

  const handleCopy = async () => {
    if (state.kind === 'loading') return
    setState({ kind: 'loading' })

    try {
      const issue = await fetch(
        `/api/v1/admin/config/credentials/${encodeURIComponent(provider)}/copy-token`,
        { method: 'POST' },
      )
      if (!issue.ok) throw new Error(`issue ${issue.status}`)
      const { data } = (await issue.json()) as { data: { token: string } }

      const consume = await fetch(
        `/api/v1/admin/config/credentials/${encodeURIComponent(provider)}/copy-token?t=${encodeURIComponent(
          data.token,
        )}`,
        { method: 'GET', cache: 'no-store' },
      )
      if (!consume.ok) throw new Error(`consume ${consume.status}`)
      const payload = (await consume.json()) as { data: { value: string } }
      let value: string | undefined = payload.data.value

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        value = undefined // drop reference
        setState({ kind: 'success' })
        toast.success('Copiado (válido por 30s).')
        setTimeout(() => setState({ kind: 'idle' }), 2500)
        return
      }

      // Fallback: modal com input password + countdown auto-limpeza.
      const safeValue = value
      value = undefined
      setState({ kind: 'fallback', value: safeValue ?? '', countdownSec: 10 })
    } catch (err) {
      const status =
        err instanceof Error && /\b(4\d\d|5\d\d)\b/.exec(err.message)?.[0]
      if (status === '410') toast.error('Token expirado. Tente novamente.')
      else toast.error('Falha ao copiar credencial.')
      setState({ kind: 'idle' })
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCopy}
        disabled={state.kind === 'loading'}
        aria-label={`Copiar credencial ${provider}`}
      >
        {state.kind === 'loading' ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : state.kind === 'success' ? (
          <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-600" aria-hidden="true" />
        ) : (
          <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        )}
        {state.kind === 'success' ? 'Copiado' : label}
      </Button>

      {state.kind === 'fallback' ? (
        <CopyFallbackModal
          value={state.value}
          onClose={() => setState({ kind: 'idle' })}
        />
      ) : null}
    </>
  )
}

function CopyFallbackModal({ value, onClose }: { value: string; onClose: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(10)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick)
          setCleared(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-fallback-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="copy-fallback-title" className="text-lg font-semibold">
          Copiar credencial
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O clipboard do navegador não está disponível. Selecione e copie manualmente —
          o campo será limpo em <strong>{secondsLeft}s</strong>.
        </p>
        <input
          type="password"
          readOnly
          value={cleared ? '' : value}
          className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Valor da credencial (readonly, auto-limpa em 10s)"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
