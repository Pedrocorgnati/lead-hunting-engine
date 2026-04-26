import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Obrigado',
  description: 'Recebemos sua mensagem. Em breve entraremos em contato.',
  alternates: { canonical: '/obrigado' },
  robots: { index: false, follow: true },
}

type Kind = 'waitlist' | 'contact' | 'other'

function copyFor(type: Kind) {
  switch (type) {
    case 'waitlist':
      return {
        title: 'Estamos quase la!',
        body: 'Seu email foi adicionado a waitlist. Assim que liberarmos o acesso, voce sera o primeiro a saber.',
      }
    case 'contact':
      return {
        title: 'Mensagem recebida!',
        body: 'Obrigado pelo contato. Nosso time retorna em ate 1 dia util no email informado.',
      }
    default:
      return {
        title: 'Obrigado!',
        body: 'Recebemos sua solicitacao.',
      }
  }
}

export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const params = await searchParams
  const type = (params.type === 'waitlist' || params.type === 'contact'
    ? params.type
    : 'other') as Kind
  const copy = copyFor(type)

  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{copy.body}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao inicio
          </Link>
          <Link
            href="/#pricing"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ver planos
          </Link>
        </div>
      </div>
    </section>
  )
}
