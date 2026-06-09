'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { API_ROUTES, Routes } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/hooks/use-toast'

type SubmitStatus = 'idle' | 'success' | 'network-error'

const GENERIC_SUCCESS_MESSAGE =
  'Se houver uma conta associada a este e-mail, enviaremos as instruções para recuperar sua senha.'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function RecuperarSenhaPage() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    setStatus('idle')

    if (!normalizedEmail) {
      setEmailError('Informe o e-mail cadastrado.')
      return
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailError('Informe um e-mail válido.')
      return
    }

    setEmailError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch(API_ROUTES.AUTH_PASSWORD_RESET_REQUEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })

      if (!response.ok) {
        setStatus('network-error')
        toast.error('Não foi possível enviar a solicitação. Tente novamente em instantes.')
        return
      }

      setStatus('success')
      toast.success('Solicitação recebida.')
    } catch {
      setStatus('network-error')
      toast.error('Falha de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName = cn(
    'h-11 min-h-[44px] w-full rounded-lg border bg-background px-3 py-2 text-base text-foreground outline-none transition-colors',
    'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm',
    'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-80',
    emailError ? 'border-destructive focus-visible:ring-destructive/20' : 'border-border'
  )

  return (
    <main
      data-testid="recuperar-senha-page"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
    >
      <section className="w-full max-w-md space-y-6" aria-labelledby="recuperar-senha-title">
        <div className="space-y-2">
          <h1 id="recuperar-senha-title" className="text-2xl font-bold text-foreground">
            Recuperar senha
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Informe seu e-mail para receber instruções de recuperação, caso ele esteja associado a uma conta.
          </p>
        </div>

        {status === 'success' ? (
          <div
            data-testid="recuperar-senha-success"
            role="status"
            aria-live="polite"
            className="space-y-3 rounded-lg border border-border bg-card p-5 text-sm text-card-foreground"
          >
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
              Solicitação recebida
            </div>
            <p className="leading-6 text-muted-foreground">{GENERIC_SUCCESS_MESSAGE}</p>
          </div>
        ) : (
          <form
            data-testid="form-recuperar-senha"
            aria-label="Formulário de recuperação de senha"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                E-mail <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  data-testid="form-recuperar-senha-email-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'recuperar-senha-email-error' : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  className={cn(inputClassName, 'pl-10')}
                />
              </div>
              {emailError && (
                <p
                  id="recuperar-senha-email-error"
                  data-testid="form-recuperar-senha-email-error"
                  role="alert"
                  className="flex items-center gap-1 text-xs text-destructive"
                >
                  <AlertCircle className="size-3" aria-hidden="true" />
                  {emailError}
                </p>
              )}
            </div>

            {status === 'network-error' && (
              <div
                data-testid="recuperar-senha-network-error"
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Não foi possível concluir agora. Tente novamente em instantes.</span>
              </div>
            )}

            <button
              type="submit"
              data-testid="form-recuperar-senha-submit-button"
              disabled={isSubmitting}
              className={cn(
                'flex h-11 min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors',
                'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-80'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Enviando...
                </>
              ) : (
                'Enviar instruções'
              )}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link
            href={Routes.LOGIN}
            data-testid="recuperar-senha-back-to-login-link"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Voltar ao login
          </Link>
        </div>
      </section>
    </main>
  )
}
