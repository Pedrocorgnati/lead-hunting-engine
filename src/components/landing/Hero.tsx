import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import heroContent from '@/content/landing/hero.json'

export function Hero() {
  const { eyebrow, headline, headlineHighlight, sub, primaryCta, secondaryCta, trustSignals } = heroContent

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-slate-950 pt-20 pb-16 sm:pt-28 sm:pb-24"
    >
      <Image
        src="/images/landing-hero-dashboard.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 -z-20 object-cover object-center"
        aria-hidden="true"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(12,17,32,0.98)_0%,rgba(12,17,32,0.88)_42%,rgba(12,17,32,0.42)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl text-left">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-200">
            {eyebrow}
          </p>
          <h1
            id="hero-heading"
            className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            {headline}{' '}
            <span className="text-blue-200">{headlineHighlight}</span>
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-slate-200 sm:text-xl">
            {sub}
          </p>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
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
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/15 sm:w-auto"
              data-testid="hero-secondary-cta"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-200">
            {trustSignals.map((signal) => (
              <li key={signal} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                {signal}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
