import Link from 'next/link'
import { LEGAL_VERSIONS } from '@/lib/legal/versions'

interface LegalFooterProps {
  className?: string
}

export function LegalFooter({ className }: LegalFooterProps) {
  const { termsVersion, privacyVersion, updatedAt } = LEGAL_VERSIONS

  return (
    <footer
      data-testid="legal-footer"
      className={
        'mt-12 border-t border-border/60 pt-4 pb-6 text-xs text-muted-foreground ' +
        (className ?? '')
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Link href="/termos" className="hover:text-foreground hover:underline">
          Termos v{termsVersion}
        </Link>
        <span aria-hidden>•</span>
        <Link href="/privacidade" className="hover:text-foreground hover:underline">
          Privacidade v{privacyVersion}
        </Link>
        <span aria-hidden>•</span>
        <span>atualizado em {updatedAt}</span>
      </div>
    </footer>
  )
}
