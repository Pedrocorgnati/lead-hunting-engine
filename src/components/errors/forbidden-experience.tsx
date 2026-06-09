'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Routes } from '@/lib/constants'
import { reportErrorPage } from '@/lib/report-error-page'

/**
 * Experiencia da pagina /erro/403 (P13).
 *
 * Role: a task pede a "role retornada pelo middleware de auth (header
 * x-user-role ou contexto de sessao)". O middleware deste projeto
 * (`src/middleware.ts`) NAO injeta `x-user-role`, entao derivamos a role do
 * contexto de sessao via `GET /api/v1/profile` (mesma sonda usada por
 * `error-experience.tsx`): 200 => sessao valida (role `user`); caso
 * contrario `guest`. Nunca expomos o recurso protegido que originou o 403.
 *
 * CTA por role:
 *  - user  -> `/dashboard`
 *  - guest -> `/login` (entrada real de "solicitar acesso"; a rota
 *             `/solicitar-acesso` citada na task nao existe no app, e criar
 *             link para ela violaria ECU/Zero Orfaos).
 */
type Role = 'user' | 'guest' | 'unknown'

export function ForbiddenExperience() {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [role, setRole] = useState<Role>('unknown')

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Reporta o 403 ao endpoint canonico no mount (best-effort, falha por ambiente).
  useEffect(() => {
    void reportErrorPage('app.forbidden-page')
  }, [])

  // Deriva a role do contexto de sessao sem vazar o recurso protegido.
  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/profile', { credentials: 'include' })
      .then((response) => {
        if (!cancelled) setRole(response.ok ? 'user' : 'guest')
      })
      .catch(() => {
        if (!cancelled) setRole('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isUser = role === 'user'
  const roleLabel = role === 'unknown' ? 'verificando...' : role === 'user' ? 'usuario' : 'visitante'

  return (
    <main
      data-testid="error-403-page"
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center"
      aria-labelledby="error-403-title"
    >
      <ShieldAlert className="h-12 w-12 text-destructive" aria-hidden="true" />

      <div className="space-y-2">
        <h1
          id="error-403-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          Acesso negado
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Voce nao tem permissao para acessar este recurso. Nao exibimos qual recurso foi solicitado
          por motivos de seguranca.
        </p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Perfil identificado: <span className="font-medium">{roleLabel}</span>
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {isUser ? (
          <Link
            href={Routes.DASHBOARD}
            className={buttonVariants({ variant: 'default' })}
            aria-label="Voltar para o painel"
          >
            Ir para o painel
          </Link>
        ) : (
          <Link
            href={Routes.LOGIN}
            className={buttonVariants({ variant: 'default' })}
            aria-label="Entrar para solicitar acesso"
          >
            Solicitar acesso
          </Link>
        )}
        <a
          href="mailto:suporte@leadhunting.app"
          className={buttonVariants({ variant: 'outline' })}
          aria-label="Falar com o suporte por email"
        >
          Falar com o suporte
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        Codigo de erro: <code>403 Forbidden</code>
      </p>
    </main>
  )
}
