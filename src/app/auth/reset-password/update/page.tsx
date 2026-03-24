'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import zxcvbn from 'zxcvbn'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrength } from '@/components/auth/password-strength'
import { apiClient } from '@/lib/utils/api-client'
import { Routes, API_ROUTES } from '@/lib/constants'
import { useToast } from '@/lib/hooks/use-toast'

const updateSchema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const result = zxcvbn(data.password)
    if (result.score < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Senha muito fraca. Use pelo menos 8 caracteres com números e símbolos.',
        path: ['password'],
      })
    }
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  })

type UpdateData = z.infer<typeof updateSchema>

function UpdatePasswordForm() {
  const router = useRouter()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateData>({ resolver: zodResolver(updateSchema) })

  async function onSubmit(data: UpdateData) {
    setError(null)
    const result = await apiClient.post(API_ROUTES.AUTH_UPDATE_PASSWORD, {
      password: data.password,
    })
    if (result.error) {
      const msg = result.error.message ?? 'Erro ao atualizar senha. O link pode ter expirado.'
      setError(msg)
      toast.error(msg)
      return
    }
    setSuccess(true)
    toast.success('Senha atualizada com sucesso!')
    setTimeout(() => router.push(Routes.LOGIN), 2000)
  }

  if (success) {
    return (
      <div role="status" className="text-center py-4">
        <p className="text-success font-medium">
          Senha atualizada com sucesso! Redirecionando...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Nova senha <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          disabled={isSubmitting}
          aria-required
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'update-password-error' : undefined}
          {...register('password')}
        />
        <PasswordStrength password={watch('password') ?? ''} />
        {errors.password && (
          <p
            id="update-password-error"
            className="text-xs text-destructive flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
          Confirmar nova senha{' '}
          <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          disabled={isSubmitting}
          aria-required
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={
            errors.confirmPassword ? 'update-confirm-error' : undefined
          }
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p
            id="update-confirm-error"
            className="text-xs text-destructive flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin w-4 h-4"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Salvando...
          </span>
        ) : (
          'Salvar nova senha'
        )}
      </Button>
    </form>
  )
}

export default function UpdatePasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-foreground mb-8">Nova senha</h1>
        <Suspense
          fallback={
            <div className="text-muted-foreground">Carregando...</div>
          }
        >
          <UpdatePasswordForm />
        </Suspense>
      </div>
    </main>
  )
}
