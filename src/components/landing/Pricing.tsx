import Link from 'next/link'
import { Check } from 'lucide-react'
import pricingContent from '@/content/landing/pricing.json'

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="bg-muted/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="pricing-heading"
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Planos que crescem com você
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sem contrato anual. Cancele quando quiser. Upgrade instantâneo.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {pricingContent.tiers.map((tier) => (
            <article
              key={tier.id}
              className={[
                'relative flex flex-col rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md',
                tier.highlight
                  ? 'border-primary bg-card ring-2 ring-primary'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                  Mais popular
                </span>
              )}
              <header className="mb-4">
                <h3 className="text-xl font-semibold text-foreground">{tier.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">{tier.period}</span>
                  )}
                </p>
              </header>
              <ul className="mb-6 space-y-2 text-sm text-foreground">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.cta.target}
                className={[
                  'mt-auto inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                  tier.highlight
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border bg-background text-foreground hover:bg-accent',
                ].join(' ')}
                data-testid={`pricing-cta-${tier.id}`}
              >
                {tier.cta.label}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
