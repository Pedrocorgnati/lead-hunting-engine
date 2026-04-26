import Link from 'next/link'

interface CTAProps {
  title?: string
  subtitle?: string
  primaryLabel?: string
  primaryHref?: string
  secondaryLabel?: string
  secondaryHref?: string
}

export function CTA({
  title = 'Pronto para encher sua pipeline?',
  subtitle = 'Entre na waitlist para receber acesso antecipado e um bonus de 100 leads grátis.',
  primaryLabel = 'Entrar na waitlist',
  primaryHref = '#waitlist',
  secondaryLabel = 'Falar com vendas',
  secondaryHref = '/contato',
}: CTAProps) {
  return (
    <section aria-labelledby="cta-heading" className="py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="rounded-3xl bg-primary/5 px-6 py-14 sm:px-12 sm:py-16 ring-1 ring-primary/10">
          <h2
            id="cta-heading"
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{subtitle}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
              data-testid="cta-primary"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-accent sm:w-auto"
              data-testid="cta-secondary"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
