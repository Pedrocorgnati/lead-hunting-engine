'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import zxcvbn from 'zxcvbn'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrength } from '@/components/auth/password-strength'
import { TermsCheckbox } from '@/components/auth/terms-checkbox'
import { apiClient } from '@/lib/utils/api-client'
import { Routes, API_ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'

const activationSchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirme sua senha.'),
    termsAccepted: z
      .boolean()
      .refine((v) => v === true, 'Você deve aceitar os termos de uso.'),
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

type ActivationFormData = z.infer<typeof activationSchema>

interface InviteActivationFormProps {
  token: string
}

export function InviteActivationForm({ token }: InviteActivationFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ActivationFormData>({
    resolver: zodResolver(activationSchema),
    mode: 'onSubmit',
    defaultValues: { termsAccepted: false },
  })

  const passwordValue = watch('password', '')

  async function onSubmit(data: ActivationFormData) {
    setServerError(null)

    const result = await apiClient.post(API_ROUTES.INVITES_ACTIVATE(token), {
      password: data.password,
      termsAccepted: data.termsAccepted,
    })

    if (result.error) {
      setServerError(result.error.message)
      toast.error(result.error.message)
      return
    }

    toast.success('Conta ativada com sucesso!')
    router.push(Routes.DASHBOARD)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Ativar minha conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie uma senha para acessar a plataforma.
        </p>
      </div>

      <form
        data-testid="form-invite-activation"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5"
      >
        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Criar senha <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <Input
            id="password"
            data-testid="form-invite-password-input"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            disabled={isSubmitting}
            aria-required
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && (
            <p
              id="password-error"
              className="text-xs text-destructive flex items-center gap-1"
              role="alert"
            >
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="text-sm font-medium text-foreground"
          >
            Confirmar senha{' '}
            <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <Input
            id="confirmPassword"
            data-testid="form-invite-confirm-password-input"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            disabled={isSubmitting}
            aria-required
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? 'confirmPassword-error' : undefined
            }
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p
              id="confirmPassword-error"
              className="text-xs text-destructive flex items-center gap-1"
              role="alert"
            >
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <TermsCheckbox
          checked={watch('termsAccepted')}
          onChange={(v) => setValue('termsAccepted', v, { shouldValidate: true })}
          error={errors.termsAccepted?.message}
        />

        {/* Server error */}
        {serverError && (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          data-testid="form-invite-submit-button"
          disabled={isSubmitting}
          className="w-full"
          size="lg"
        >
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
              Ativando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Ativar conta
            </span>
          )}
        </Button>

        <div className="text-center">
          <Link
            href={Routes.LOGIN}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Já tenho conta — Entrar
          </Link>
        </div>
      </form>
    </div>
  )
}
