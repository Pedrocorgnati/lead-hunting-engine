'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Routes } from '@/lib/constants'

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'O campo E-mail é obrigatório.')
    .email('Insira um endereço de e-mail válido.'),
  password: z
    .string()
    .min(1, 'O campo Senha é obrigatório.')
    .min(8, 'A senha deve ter no mínimo 8 caracteres.'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
  })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)
    try {
      // TODO: Implementar backend — run /auto-flow execute
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (res.status === 401) {
        // AUTH_002: alinhado ao ERROR-CATALOG
        setServerError('Email ou senha incorretos.')
        return
      }
      if (res.status === 429) {
        // AUTH_003: alinhado ao ERROR-CATALOG
        setServerError('Muitas tentativas. Tente novamente em alguns segundos.')
        return
      }
      if (!res.ok) {
        setServerError('Serviço temporariamente indisponível. Tente novamente em instantes.')
        return
      }

      router.push(Routes.DASHBOARD)
      router.refresh()
    } catch {
      setServerError('Serviço temporariamente indisponível. Tente novamente em instantes.')
    }
  }

  const inputBaseClass = cn(
    'w-full h-10 px-3 py-2 text-sm bg-background text-foreground border border-border rounded-md outline-none',
    'placeholder:text-muted-foreground transition-all duration-[120ms]',
    'focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:border-primary',
    'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:border-border',
    'motion-reduce:transition-none'
  )

  return (
    <form
      data-testid="form-login"
      onSubmit={handleSubmit(onSubmit)}
      aria-label="Formulário de login"
      aria-busy={isSubmitting}
      noValidate
      className="space-y-5"
    >
      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          E-mail{' '}
          <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <input
          id="email"
          data-testid="form-login-email-input"
          type="email"
          autoComplete="email"
          placeholder="operador@empresa.com"
          aria-label="Endereço de e-mail"
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          disabled={isSubmitting}
          {...register('email')}
          className={cn(inputBaseClass, errors.email && 'border-destructive focus:ring-destructive')}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Senha{' '}
          <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            data-testid="form-login-password-input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-label="Senha de acesso"
            aria-required="true"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={isSubmitting}
            {...register('password')}
            className={cn(
              inputBaseClass,
              'pr-10',
              errors.password && 'border-destructive focus:ring-destructive'
            )}
          />
          <button
            type="button"
            data-testid="form-login-password-toggle-button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Server error */}
      {serverError && (
        <div
          id="server-error"
          data-testid="form-login-server-error"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        data-testid="form-login-submit-button"
        disabled={isSubmitting}
        aria-label={isSubmitting ? 'Entrando...' : 'Entrar na plataforma'}
        aria-disabled={isSubmitting}
        className={cn(
          'w-full h-11 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md',
          'transition-all duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-80',
          'motion-reduce:transition-none'
        )}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin w-4 h-4 text-primary-foreground"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Entrando...
          </span>
        ) : (
          'Entrar'
        )}
      </button>

      {/* Forgot password link */}
      <div className="text-center mt-4">
        <a
          href="/auth/reset-password"
          data-testid="form-login-forgot-link"
          tabIndex={isSubmitting ? -1 : 0}
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm"
        >
          Esqueci minha senha
        </a>
      </div>
    </form>
  )
}
