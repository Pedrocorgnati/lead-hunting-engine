import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Recuperar senha',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <main data-testid="reset-password-page" className="min-h-screen flex items-center justify-center bg-background p-8">
      <div data-testid="reset-password-container" className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Insira seu e-mail para receber um link de redefinição de senha.
          </p>
        </div>

        {/* TODO: Implementar backend — run /auto-flow execute */}
        <form data-testid="form-reset-password" className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              E-mail <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              data-testid="form-reset-password-email-input"
              className="w-full h-10 px-3 py-2 text-sm bg-background text-foreground border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <button
            type="submit"
            data-testid="form-reset-password-submit-button"
            className="w-full h-11 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Enviar link de recuperação
          </button>
        </form>

        <div className="text-center">
          <Link href={Routes.LOGIN} data-testid="reset-password-back-to-login-link" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  )
}
