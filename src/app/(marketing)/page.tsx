import type { Metadata } from 'next'
import { Hero } from '@/components/landing/Hero'
import { Pricing } from '@/components/landing/Pricing'
import { CTA } from '@/components/landing/CTA'
import { FAQ } from '@/components/landing/FAQ'
import { WaitlistForm } from '@/components/landing/WaitlistForm'

export const metadata: Metadata = {
  title: 'Lead Hunting Engine — Prospeccao B2B automatizada com IA',
  description:
    'Encontre leads qualificados em minutos. Coleta automatizada de Google Maps, Instagram, Facebook e SERP com scoring IA, pitch personalizado e compliance LGPD. Sem contrato anual.',
  keywords: [
    'prospeccao B2B',
    'lead generation',
    'sdr',
    'agencia marketing',
    'leads qualificados',
    'Google Maps scraping',
    'LGPD',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    title: 'Lead Hunting Engine — Prospeccao B2B automatizada',
    description:
      'Encontre leads qualificados em minutos. Coleta de Maps, Instagram, Facebook e SERP com IA e compliance LGPD.',
    siteName: 'Lead Hunting Engine',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lead Hunting Engine',
    description: 'Prospeccao B2B automatizada com IA.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function MarketingHomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para conteudo principal
      </a>
      <Hero />
      <Pricing />
      <section
        id="waitlist"
        aria-labelledby="waitlist-heading"
        className="bg-card py-20 sm:py-24"
      >
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-8 text-center">
            <h2
              id="waitlist-heading"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Entre na waitlist
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Acesso antecipado e 100 leads bonus na primeira coleta.
            </p>
          </div>
          <WaitlistForm />
        </div>
      </section>
      <CTA />
      <FAQ />
    </>
  )
}
