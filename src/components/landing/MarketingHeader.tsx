import Link from 'next/link'

export function MarketingHeader() {
  return (
    <header
      aria-label="Navegacao principal"
      className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-label="Ir para pagina inicial"
          className="text-lg font-semibold text-foreground"
        >
          Lead Hunting Engine
        </Link>
        <nav aria-label="Links principais" className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <Link href="/#pricing" className="text-muted-foreground hover:text-foreground">
            Planos
          </Link>
          <Link href="/#faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
          <Link href="/contato" className="text-muted-foreground hover:text-foreground">
            Contato
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            href="/#waitlist"
            className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Waitlist
          </Link>
        </div>
      </div>
    </header>
  )
}
