import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import heroContent from '@/content/landing/hero.json'

export function Hero() {
  const { eyebrow, headline, headlineHighlight, sub, primaryCta, secondaryCta, trustSignals } = heroContent

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-background pt-20 pb-16 sm:pt-28 sm:pb-24"
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary">
            {eyebrow}
          </p>
          <h1
            id="hero-heading"
            className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            {headline}{' '}
            <span className="text-primary">{headlineHighlight}</span>
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {sub}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryCta.target}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
              data-testid="hero-primary-cta"
            >
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={secondaryCta.target}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-accent sm:w-auto"
              data-testid="hero-secondary-cta"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trustSignals.map((signal) => (
              <li key={signal} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                {signal}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
