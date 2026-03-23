import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { Routes } from '@/lib/constants/routes'

export default function NotFound() {
  return (
    <main data-testid="not-found-page" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center bg-background">
      <div className="rounded-full bg-muted p-6">
        <SearchX className="h-12 w-12 text-muted-foreground" aria-hidden={true} />
      </div>

      <div className="space-y-2">
        <p className="text-4xl font-bold text-foreground">404</p>
        <h1 className="text-xl font-semibold text-foreground">Página não encontrada</h1>
        <p className="text-muted-foreground max-w-sm">
          A página que você está procurando não existe ou foi removida.
        </p>
      </div>

      <Link
        href={Routes.DASHBOARD}
        data-testid="not-found-back-home-link"
        className="px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Voltar ao início
      </Link>
    </main>
  )
}
