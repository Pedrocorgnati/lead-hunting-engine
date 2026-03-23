import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta no Lead Hunting Engine e descubra oportunidades de negócio com inteligência artificial.',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <main data-testid="login-page" className="min-h-screen flex">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:shadow-md focus:ring-2 focus:ring-primary focus:outline-none text-sm"
      >
        Pular para o conteúdo principal
      </a>

      {/* Left panel — desktop decorative */}
      <div
        data-testid="login-decorative-panel"
        aria-hidden="true"
        className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12"
      >
        <div className="text-primary-foreground max-w-md text-center space-y-4">
          <div className="mb-8">
            {/* @ASSET_PLACEHOLDER
            name: logo-symbol
            type: image
            extension: svg
            format: 1:1
            dimensions: 120x120
            description: Logo símbolo do Lead Hunting Engine em formato vetorial. Forma geométrica abstrata representando prospecção inteligente e conectividade de dados.
            context: Painel esquerdo da página de login
            style: Minimalista, linhas finas, monocromático branco
            mood: Profissional, moderno, confiável
            colors: white (#FFFFFF)
            elements: Forma geométrica abstrata com símbolo de busca/alvo
            avoid: Gradientes, sombras, texto, complexidade excessiva
            */}
            <span className="text-4xl font-bold text-primary-foreground tracking-tight">
              Lead Hunting Engine
            </span>
          </div>

          <h1 className="text-3xl font-bold text-primary-foreground leading-tight">
            Encontre seus leads com inteligência
          </h1>

          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            Descubra oportunidades de negócio com inteligência artificial.
            Rápido, eficiente e poderoso.
          </p>

          <ul className="mt-8 space-y-3 text-left">
            {[
              'Prospecção automatizada com IA',
              'Dados de leads verificados em tempo real',
              'Exportação para CRM com um clique',
            ].map((bullet) => (
              <li key={bullet} className="flex items-center gap-3 text-primary-foreground/90">
                <Check className="w-5 h-5 shrink-0" aria-hidden={true} />
                <span className="text-base">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — form */}
      <div data-testid="login-form-panel" className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-background">
        <div id="main-content" data-testid="login-form-container" className="w-full max-w-md space-y-8">
          {/* Mobile brand hint */}
          <div className="lg:hidden mb-6">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              Lead Hunting Engine
            </span>
          </div>

          <div className="sm:shadow-sm sm:rounded-xl sm:p-8 sm:bg-card lg:shadow-none lg:rounded-none lg:p-0 lg:bg-transparent">
            <div className="space-y-2 mb-8">
              <h2 className="text-2xl font-bold text-foreground">
                Entrar na plataforma
              </h2>
              <p className="text-sm text-muted-foreground">
                Insira suas credenciais para acessar o painel.
              </p>
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  )
}
