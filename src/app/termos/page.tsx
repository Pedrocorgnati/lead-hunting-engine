import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants'
import { loadLegalDoc, formatUpdatedAt } from '@/lib/legal/load-legal-doc'
import { LegalMarkdown } from '@/components/legal/LegalMarkdown'

export const metadata: Metadata = {
  title: 'Termos de Uso | Lead Hunting Engine',
  description:
    'Termos de Uso do Lead Hunting Engine — plataforma de prospecção B2B com tratamento de dados de pessoas jurídicas conforme LGPD.',
}

export default async function TermosPage() {
  const doc = await loadLegalDoc('terms-v1.md')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Documento legal
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-2">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Versão {doc.meta.version} — atualizado em {formatUpdatedAt(doc.meta.updatedAt)}
          </p>
        </header>

        <LegalMarkdown source={doc.body} />

        <div className="mt-10 flex gap-4 text-sm">
          <Link href="/privacidade" className="text-primary hover:underline">
            Ver Política de Privacidade
          </Link>
          <Link href={Routes.LOGIN} className="text-primary hover:underline">
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  )
}
