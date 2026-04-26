'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { waitlistSchema, type WaitlistInput } from '@/lib/schemas/landing'

export function WaitlistForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const formStartedAt = useRef<number>(Date.now())

  useEffect(() => {
    formStartedAt.current = Date.now()
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WaitlistInput>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: '',
      name: '',
      businessType: undefined,
      consentLgpd: false,
      _gotcha: '',
    },
  })

  async function onSubmit(data: WaitlistInput) {
    setError(null)
    try {
      const res = await fetch('/api/v1/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-form-started-at': String(formStartedAt.current),
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        const msg = json?.error?.message ?? 'Nao foi possivel registrar. Tente novamente.'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Tudo certo! Avisaremos assim que liberar o acesso.')
      router.push('/obrigado?type=waitlist')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexao.'
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto w-full max-w-md space-y-4"
      noValidate
      aria-label="Formulario de waitlist"
      data-testid="waitlist-form"
    >
      {/* Honeypot — fora do viewport, ignorado por humanos, disparado por bots */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
      >
        <label htmlFor="waitlist-gotcha">Nao preencher este campo</label>
        <input
          id="waitlist-gotcha"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('_gotcha')}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="waitlist-email" className="text-sm font-medium text-foreground">
          Email <span className="text-destructive">*</span>
        </label>
        <input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none ring-offset-background transition focus:ring-2 focus:ring-ring"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'waitlist-email-error' : undefined}
          disabled={isSubmitting}
          {...register('email')}
        />
        {errors.email && (
          <p
            id="waitlist-email-error"
            className="flex items-center gap-1 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="waitlist-name" className="text-sm font-medium text-foreground">
          Nome
        </label>
        <input
          id="waitlist-name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none ring-offset-background transition focus:ring-2 focus:ring-ring"
          disabled={isSubmitting}
          {...register('name')}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="waitlist-business" className="text-sm font-medium text-foreground">
          Tipo de negocio
        </label>
        <select
          id="waitlist-business"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none ring-offset-background transition focus:ring-2 focus:ring-ring"
          disabled={isSubmitting}
          {...register('businessType')}
        >
          <option value="">Selecione</option>
          <option value="AGENCIA">Agencia</option>
          <option value="CONSULTORIA">Consultoria</option>
          <option value="SDR">SDR</option>
          <option value="FREELA">Freelancer</option>
          <option value="OUTRO">Outro</option>
        </select>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="waitlist-consent"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.consentLgpd)}
          {...register('consentLgpd')}
        />
        <label htmlFor="waitlist-consent" className="text-sm text-muted-foreground">
          Aceito a{' '}
          <Link href="/privacidade" className="font-medium text-primary hover:underline">
            Politica de Privacidade
          </Link>{' '}
          e autorizo o contato sobre o Lead Hunting Engine.
        </label>
      </div>
      {errors.consentLgpd && (
        <p className="text-xs text-destructive" role="alert">
          {errors.consentLgpd.message}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="waitlist-submit"
      >
        {isSubmitting ? 'Enviando...' : 'Entrar na waitlist'}
      </button>
    </form>
  )
}
