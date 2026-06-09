'use client'

import { useId, useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import zxcvbn from 'zxcvbn'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrength } from '@/components/auth/password-strength'
import { useToast } from '@/lib/hooks/use-toast'
import { Routes } from '@/lib/constants'

const ResetSchema = z
  .object({
    password: z.string().min(8, 'Minimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (zxcvbn(data.password).score < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Senha muito fraca. Use pelo menos 8 caracteres com numeros e simbolos.',
        path: ['password'],
      })
    }
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas nao coincidem.',
    path: ['confirmPassword'],
  })

type ResetData = z.infer<typeof ResetSchema>

function ResetPasswordInner() {
  const router = useRouter()
  const toast = useToast()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const feedbackRegionId = useId()

  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid' | 'network-error'>(
    token ? 'loading' : 'invalid',
  )
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid')
      return
    }
    setTokenStatus('loading')
    const controller = new AbortController()
    fetch(`/api/v1/auth/password/reset-token/${encodeURIComponent(token)}/validate`, {
      signal: controller.signal,
    })
      .then((r) => setTokenStatus(r.ok ? 'valid' : 'invalid'))
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setTokenStatus('network-error')
      })
    return () => controller.abort()
  }, [token, retryCount])

  const [feedback, setFeedback] = useState<{
    tone: 'error' | 'success'
    message: string
  } | null>(null)

  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetData>({ resolver: zodResolver(ResetSchema) })

  const passwordValue = watch('password', '')

  async function onSubmit(data: ResetData) {
    if (!token) return
    setFeedback(null)

    let res: Response
    try {
      res = await fetch('/api/v1/auth/password/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: data.password, token }),
      })
    } catch {
      // Falha de rede (offline, DNS, fetch rejeitado): nunca deixar silencioso.
      const msg = 'Falha de conexao. Verifique sua internet e tente novamente.'
      setFeedback({ tone: 'error', message: msg })
      toast.error(msg)
      return
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string }
      }
      const msg =
        body?.error?.code === 'TOKEN_INVALID'
          ? 'O link de redefinicao e invalido ou ja foi utilizado. Solicite um novo.'
          : body?.error?.message ?? 'Erro ao redefinir a senha. Tente novamente.'
      setFeedback({ tone: 'error', message: msg })
      toast.error(msg)
      return
    }

    setSuccess(true)
    setFeedback({ tone: 'success', message: 'Senha redefinida com sucesso!' })
    toast.success('Senha redefinida com sucesso!')
    setTimeout(() => router.push(`${Routes.LOGIN}?reason=password_changed`), 2500)
  }

  if (tokenStatus === 'loading') {
    return (
      <div
        className="flex justify-center py-8"
        role="status"
        aria-label="Validando link de redefinicao..."
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  if (tokenStatus === 'network-error') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-destructive">
          Falha de conexao. Verifique sua internet e tente novamente.
        </p>
        <button
          type="button"
          onClick={() => setRetryCount((n) => n + 1)}
          className="text-sm underline"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (tokenStatus === 'invalid') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-destructive">
          {token
            ? 'Link invalido ou expirado. Solicite um novo link de redefinicao.'
            : 'Link invalido ou incompleto. O token de redefinicao esta ausente.'}
        </p>
        <Link href={Routes.RECUPERAR_SENHA ?? '/recuperar-senha'} className="text-sm underline">
          Solicitar novo link
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center"
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-medium text-emerald-700">
          Senha redefinida! Redirecionando para o login...
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      aria-label="Formulario de redefinicao de senha"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Nova senha
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isSubmitting}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {passwordValue && <PasswordStrength password={passwordValue} />}
        {errors.password && (
          <p id="password-error" role="alert" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirmar nova senha
        </label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          disabled={isSubmitting}
          aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p id="confirm-error" role="alert" className="text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div
        id={feedbackRegionId}
        role="status"
        aria-live="polite"
        className="min-h-[1rem] text-xs"
      >
        {feedback && (
          <span className={feedback.tone === 'error' ? 'text-destructive' : 'text-emerald-600'}>
            {feedback.message}
          </span>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Redefinir senha
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        <Link href={Routes.LOGIN} className="underline">
          Voltar ao login
        </Link>
      </p>
    </form>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">
            Defina sua nova senha abaixo.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="flex justify-center py-8" aria-label="Carregando...">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          }
        >
          <ResetPasswordInner />
        </Suspense>
      </div>
    </main>
  )
}
