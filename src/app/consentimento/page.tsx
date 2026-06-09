import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants/routes'
import { ConsentClient } from './ConsentClient'

export const metadata: Metadata = {
  title: 'Gerenciar consentimento | Lead Hunting Engine',
  description:
    'Veja, altere, revogue e baixe o comprovante das suas preferencias de consentimento LGPD do Lead Hunting Engine.',
}

/**
 * TASK-3/A2 (P0) — P15 /consentimento.
 *
 * Server Component (apenas shell + metadata). Toda a interatividade vive em
 * `ConsentClient` ('use client') para evitar o 500 de 'use client' direto no
 * page.tsx (App Router / Next 16).
 */
export default function ConsentimentoPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-8">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Privacidade
          </p>
          <h1 className="mb-2 text-3xl font-bold text-foreground">
            Gerenciar consentimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle como tratamos seus dados. Suas escolhas geram um comprovante
            LGPD assinado que voce pode baixar a qualquer momento.
          </p>
        </header>

        <ConsentClient />

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link href={Routes.PRIVACIDADE} className="text-primary hover:underline">
            Ver Politica de Privacidade
          </Link>
          <Link href={Routes.HOME} className="text-primary hover:underline">
            ← Voltar ao inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
