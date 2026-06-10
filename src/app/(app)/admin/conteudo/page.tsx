import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getAuthenticatedUser } from '@/lib/auth'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Conteudo editorial - Admin',
  description:
    'Onde vive cada conteudo institucional (landing, cases, termos e privacidade) e como atualiza-lo. Decisao de escopo estatico registrada em ADR-content-static-scope.',
  robots: { index: false, follow: false },
}

/**
 * /admin/conteudo (AD31) - pagina de politica, nao um editor.
 *
 * O conteudo institucional permanece estatico e versionado por git
 * (decisao registrada em `docs/ADR-content-static-scope.md`). Esta tela
 * documenta para administradores onde cada conteudo vive e como edita-lo
 * via Pull Request. Nao expoe edicao in-app nem endpoints `/api/v1/admin/content/*`
 * (deliberadamente nao implementados sob o ADR), evitando botoes orfaos.
 */
const CONTENT_SOURCES = [
  {
    domain: 'Landing page',
    source: 'src/content/landing/{hero,pricing,faq}.json',
    rendered: '/',
  },
  {
    domain: 'Cases / Casos de uso',
    source: 'src/content/cases/index.json',
    rendered: '/casos-de-uso',
  },
  {
    domain: 'Termos de uso',
    source: 'src/content/legal/terms-v1.md',
    rendered: '/termos',
  },
  {
    domain: 'Politica de privacidade',
    source: 'src/content/legal/privacy-v1.md',
    rendered: '/privacidade',
  },
] as const

export default async function ConteudoAdminPage() {
  const authUser = await getAuthenticatedUser()
  if (!authUser) {
    redirect(Routes.LOGIN)
  }
  if (authUser.role !== 'ADMIN') {
    redirect('/erro/403')
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Politica administrativa
        </p>
        <h1 className="text-2xl font-bold text-foreground">Conteudo editorial</h1>
        <p className="text-sm text-muted-foreground">
          O conteudo institucional (landing, cases, termos e privacidade) e gerenciado de forma
          estatica e versionado por git. Esta pagina nao e um editor: ela documenta onde cada
          conteudo vive e como atualiza-lo.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Onde editar cada conteudo</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Conteudo</th>
                <th scope="col" className="px-4 py-2 font-medium">Fonte no repositorio</th>
                <th scope="col" className="px-4 py-2 font-medium">Renderizado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CONTENT_SOURCES.map((row) => (
                <tr key={row.domain}>
                  <td className="px-4 py-2 font-medium text-foreground">{row.domain}</td>
                  <td className="px-4 py-2">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                      {row.source}
                    </code>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={row.rendered}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {row.rendered}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          Para atualizar, edite o arquivo correspondente e abra um Pull Request. A mudanca entra em
          producao apos revisao e merge, herdando historico e rollback do git. Termos e privacidade
          exigem revisao juridica antes do merge.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Por que nao ha edicao in-app</h2>
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            O escopo estatico foi decidido para manter trilha de auditoria por PR e revisao
            juridica de termos e privacidade. A decisao completa, com fontes e trade-offs, esta
            registrada na ADR{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              docs/ADR-content-static-scope.md
            </code>
            . Nenhum endpoint <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1/admin/content/*</code>{' '}
            e exposto sob esta decisao.
          </span>
        </div>
      </section>
    </main>
  )
}
