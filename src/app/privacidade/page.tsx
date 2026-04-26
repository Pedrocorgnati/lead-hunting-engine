import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants'
import { loadLegalDoc, formatUpdatedAt } from '@/lib/legal/load-legal-doc'
import { LegalMarkdown } from '@/components/legal/LegalMarkdown'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Lead Hunting Engine',
  description:
    'Política de Privacidade do Lead Hunting Engine — tratamento de dados públicos B2B sob legítimo interesse (Art. 7 IX LGPD), direitos do titular e canais de remoção.',
}

export default async function PrivacidadePage() {
  const doc = await loadLegalDoc('privacy-v1.md')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Documento legal
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-2">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground">
            Versão {doc.meta.version} — atualizado em {formatUpdatedAt(doc.meta.updatedAt)}
          </p>
        </header>

        <LegalMarkdown source={doc.body} />

        <div className="mt-10 flex gap-4 text-sm">
          <Link href="/termos" className="text-primary hover:underline">
            Ver Termos de Uso
          </Link>
          <Link href={Routes.LOGIN} className="text-primary hover:underline">
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  )
}
