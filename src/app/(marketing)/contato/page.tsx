import type { Metadata } from 'next'
import { ContactForm } from '@/components/landing/ContactForm'

export const metadata: Metadata = {
  title: 'Contato',
  description:
    'Fale com o time do Lead Hunting Engine. Tire duvidas, peca demo ou explore integracoes.',
  alternates: { canonical: '/contato' },
  openGraph: {
    title: 'Contato | Lead Hunting Engine',
    description: 'Fale com o time do Lead Hunting Engine.',
    url: '/contato',
    type: 'website',
  },
}

export default function ContatoPage() {
  return (
    <section
      aria-labelledby="contato-heading"
      className="py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-10 text-center">
          <h1
            id="contato-heading"
            className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
          >
            Vamos conversar
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Conte o seu caso e o time retorna em ate 1 dia util.
          </p>
        </div>
        <ContactForm />
      </div>
    </section>
  )
}
