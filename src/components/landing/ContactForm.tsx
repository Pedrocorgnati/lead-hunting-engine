'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { contactSchema, type ContactInput } from '@/lib/schemas/landing'

export function ContactForm() {
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
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      email: '',
      name: '',
      subject: '',
      message: '',
      consentLgpd: false,
      _gotcha: '',
    },
  })

  async function onSubmit(data: ContactInput) {
    setError(null)
    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-form-started-at': String(formStartedAt.current),
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        const msg = json?.error?.message ?? 'Nao foi possivel enviar. Tente novamente.'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Mensagem enviada!')
      router.push('/obrigado?type=contact')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexao.'
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto w-full max-w-xl space-y-4"
      noValidate
      aria-label="Formulario de contato"
      data-testid="contact-form"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
      >
        <label htmlFor="contact-gotcha">Nao preencher</label>
        <input
          id="contact-gotcha"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('_gotcha')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
            Nome <span className="text-destructive">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          {errors.name && (
            <p className="text-xs text-destructive" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
            Email <span className="text-destructive">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-subject" className="text-sm font-medium text-foreground">
          Assunto <span className="text-destructive">*</span>
        </label>
        <input
          id="contact-subject"
          type="text"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.subject)}
          {...register('subject')}
        />
        {errors.subject && (
          <p className="text-xs text-destructive" role="alert">
            {errors.subject.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
          Mensagem <span className="text-destructive">*</span>
        </label>
        <textarea
          id="contact-message"
          rows={5}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-background p-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.message)}
          {...register('message')}
        />
        {errors.message && (
          <p className="text-xs text-destructive flex items-center gap-1" role="alert">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {errors.message.message}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input
          id="contact-consent"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.consentLgpd)}
          {...register('consentLgpd')}
        />
        <label htmlFor="contact-consent" className="text-sm text-muted-foreground">
          Aceito a{' '}
          <Link href="/privacidade" className="font-medium text-primary hover:underline">
            Politica de Privacidade
          </Link>{' '}
          e autorizo o contato pelo Lead Hunting Engine.
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
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
        data-testid="contact-submit"
      >
        {isSubmitting ? 'Enviando...' : 'Enviar mensagem'}
      </button>
    </form>
  )
}
