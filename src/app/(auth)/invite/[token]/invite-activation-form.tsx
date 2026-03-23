'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Routes } from '@/lib/constants/routes'

const activationSchema = z.object({
  password: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres.')
    .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula.')
    .regex(/[0-9]/, 'A senha deve conter pelo menos um número.'),
  confirmPassword: z.string().min(1, 'Confirme sua senha.'),
  terms: z.boolean().refine((v) => v === true, 'Você deve aceitar os termos de uso.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem.',
  path: ['confirmPassword'],
})

type ActivationFormData = z.infer<typeof activationSchema>

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length

  const colors = ['bg-destructive', 'bg-orange-500', 'bg-amber-400', 'bg-green-400', 'bg-green-600']
  const labels = ['', 'Fraca', 'Fraca', 'Média', 'Forte', 'Muito forte']

  if (!password) return null

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < score ? colors[score] : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels[score]}</p>
    </div>
  )
}

interface InviteActivationFormProps {
  token: string
}

export function InviteActivationForm({ token }: InviteActivationFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [tokenInvalid] = useState(false) // TODO: validate token — run /auto-flow execute

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ActivationFormData>({
    resolver: zodResolver(activationSchema),
    mode: 'onSubmit',
  })

  const passwordValue = watch('password', '')

  if (tokenInvalid) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-destructive">Convite inválido</h1>
        <p className="text-muted-foreground">
          Este link de convite expirou ou é inválido. Solicite um novo convite ao administrador.
        </p>
        <Link
          href={Routes.LOGIN}
          className="text-primary hover:underline underline-offset-4 text-sm"
        >
          Ir para o login
        </Link>
      </div>
    )
  }

  async function onSubmit(data: ActivationFormData) {
    setServerError(null)
    try {
      // TODO: Implementar backend — run /auto-flow execute
      const res = await fetch(`/api/v1/invites/${token}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: data.password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setServerError(body?.error?.message ?? 'Erro ao ativar conta. Tente novamente.')
        return
      }

      router.push(Routes.DASHBOARD)
      router.refresh()
    } catch {
      setServerError('Serviço temporariamente indisponível. Tente novamente em instantes.')
    }
  }

  const inputClass = (hasError: boolean) => cn(
    'w-full h-10 px-3 py-2 text-sm bg-background text-foreground border border-border rounded-md outline-none',
    'placeholder:text-muted-foreground transition-all duration-[120ms]',
    'focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:border-primary',
    'disabled:bg-muted disabled:cursor-not-allowed',
    hasError && 'border-destructive focus:ring-destructive'
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Ativar minha conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie uma senha para acessar a plataforma.
        </p>
      </div>

      <form data-testid="form-invite-activation" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Criar senha <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="password"
            data-testid="form-invite-password-input"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            disabled={isSubmitting}
            {...register('password')}
            className={inputClass(!!errors.password)}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
            Confirmar senha <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="confirmPassword"
            data-testid="form-invite-confirm-password-input"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            disabled={isSubmitting}
            {...register('confirmPassword')}
            className={inputClass(!!errors.confirmPassword)}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <div className="space-y-1">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              data-testid="form-invite-terms-checkbox"
              type="checkbox"
              {...register('terms')}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">
              Aceito os{' '}
              <a href="/termos" className="underline text-primary hover:text-primary/80">
                termos de uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade" className="underline text-primary hover:text-primary/80">
                política de privacidade
              </a>
            </span>
          </label>
          {errors.terms && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.terms.message}
            </p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <div role="alert" aria-live="polite" className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          data-testid="form-invite-submit-button"
          disabled={isSubmitting}
          className={cn(
            'w-full h-11 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md',
            'hover:bg-primary/90 transition-all duration-[120ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:opacity-80 disabled:cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Ativando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Ativar conta
            </span>
          )}
        </button>

        <div className="text-center">
          <Link href={Routes.LOGIN} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Já tenho conta — Entrar
          </Link>
        </div>
      </form>
    </div>
  )
}
