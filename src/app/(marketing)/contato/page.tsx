import type { Metadata } from 'next'
import Image from 'next/image'
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
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <div className="mb-10 text-left">
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
        <div className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
          <Image
            src="/images/contact-workflow-panel.png"
            alt="Fluxo visual de triagem comercial, callback e integrações do Lead Hunting Engine"
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>
    </section>
  )
}
