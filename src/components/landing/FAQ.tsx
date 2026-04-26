import faqContent from '@/content/landing/faq.json'

export function FAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2
            id="faq-heading"
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            As duvidas mais comuns de quem esta avaliando a plataforma.
          </p>
        </div>

        <dl className="mt-10 space-y-4">
          {faqContent.items.map((item, idx) => (
            <details
              key={item.q}
              className="group rounded-xl border border-border bg-card p-5 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-foreground">
                <dt className="flex-1">{item.q}</dt>
                <span
                  className="shrink-0 text-primary transition-transform group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <dd
                id={`faq-answer-${idx}`}
                className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground"
              >
                {item.a}
              </dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  )
}
