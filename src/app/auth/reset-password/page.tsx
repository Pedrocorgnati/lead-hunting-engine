'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Routes, API_ROUTES } from '@/lib/constants'
import { apiClient } from '@/lib/utils/api-client'
import { useToast } from '@/lib/hooks/use-toast'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const toast = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    const { error } = await apiClient.post(API_ROUTES.AUTH_RESET_PASSWORD, { email: email.trim() })
    setLoading(false)

    if (error) {
      toast.error('Erro ao enviar o link. Verifique o e-mail e tente novamente.')
      return
    }

    setSent(true)
    toast.success('Link enviado! Verifique sua caixa de entrada.')
  }

  return (
    <main data-testid="reset-password-page" className="min-h-screen flex items-center justify-center bg-background p-8">
      <div data-testid="reset-password-container" className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Insira seu e-mail para receber um link de redefinição de senha.
          </p>
        </div>

        {sent ? (
          <div data-testid="reset-password-success" className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">Link enviado!</p>
            <p className="text-sm text-muted-foreground">Verifique sua caixa de entrada e a pasta de spam.</p>
          </div>
        ) : (
          <form data-testid="form-reset-password" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                E-mail <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="form-reset-password-email-input"
                className="w-full h-10 px-3 py-2 text-sm bg-background text-foreground border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              data-testid="form-reset-password-submit-button"
              className="w-full h-11 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link href={Routes.LOGIN} data-testid="reset-password-back-to-login-link" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  )
}
