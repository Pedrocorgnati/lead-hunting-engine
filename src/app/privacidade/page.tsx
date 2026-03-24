import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Esta política descreve como o Lead Hunting Engine coleta, usa e protege suas informações pessoais.
        </p>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Esta é uma versão provisória, em conformidade com a LGPD (Lei nº 13.709/2018).
            O conteúdo completo da Política de Privacidade será disponibilizado antes do lançamento oficial.
          </p>
          <p>
            Não compartilhamos seus dados com terceiros sem consentimento explícito.
            Para solicitações relacionadas a dados pessoais, entre em contato com nossa equipe.
          </p>
        </div>
        <div className="mt-8">
          <Link href={Routes.LOGIN} className="text-primary hover:underline text-sm">
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  )
}
