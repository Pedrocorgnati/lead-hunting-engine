'use client'

/**
 * TASK-18/ST003 (CL-043): dialog de re-autenticacao para operacoes sensiveis
 * (ex: delete de conta). Valida currentPassword contra Supabase.
 */
import { useState, type FormEvent } from 'react'
import { Loader2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ReauthDialogProps {
  open: boolean
  title?: string
  description?: string
  onClose: () => void
  onSuccess: () => void
}

export function ReauthDialog({
  open,
  title = 'Confirme sua identidade',
  description = 'Para continuar, digite sua senha atual.',
  onClose,
  onSuccess,
}: ReauthDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/auth/verify-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: password }),
      })
      if (res.status === 429) {
        setError('Muitas tentativas. Aguarde um minuto.')
        return
      }
      if (!res.ok) {
        setError('Senha incorreta.')
        return
      }
      setPassword('')
      onSuccess()
    } catch {
      setError('Erro ao verificar senha.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={handleSubmit}
        data-testid="reauth-dialog"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="reauth-title" className="text-lg font-semibold">
            {title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        <label className="mt-4 block text-sm font-medium">
          Senha atual
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="reauth-password-input"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive" data-testid="reauth-error">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || password.length < 6} data-testid="reauth-submit">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            ) : null}
            Confirmar
          </Button>
        </div>
      </form>
    </div>
  )
}
