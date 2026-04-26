import Link from 'next/link'

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer
      aria-label="Rodape do site"
      className="border-t border-border bg-card"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-lg font-semibold text-foreground">Lead Hunting Engine</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Prospeccao B2B automatizada com IA, sem contrato anual e respeitando LGPD.
          </p>
        </div>
        <nav aria-label="Navegacao do rodape" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Produto</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/#pricing" className="text-muted-foreground hover:text-foreground">
                  Planos
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-muted-foreground hover:text-foreground">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">
                  Entrar
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Empresa</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/contato" className="text-muted-foreground hover:text-foreground">
                  Contato
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacidade" className="text-muted-foreground hover:text-foreground">
                  Politica de Privacidade
                </Link>
              </li>
              <li>
                <Link href="/termos" className="text-muted-foreground hover:text-foreground">
                  Termos de Uso
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground">
          © {year} Lead Hunting Engine. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
