'use client'

/**
 * TASK-25/ST005 (CL-274): paginacao inline com useTransition.
 * - useTransition evita blank page / loading.tsx na troca.
 * - router.push com scroll: false preserva posicao.
 * - Enquanto isPending, linhas-skeleton abaixo da tabela indicam carregamento.
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface LeadsPaginationProps {
  page: number
  pages: number
  buildHref: (nextPage: number) => string
}

export function LeadsPagination({ page, pages, buildHref }: LeadsPaginationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const go = (nextPage: number) => {
    startTransition(() => {
      router.push(buildHref(nextPage), { scroll: false })
    })
  }

  const prevDisabled = page <= 1 || isPending
  const nextDisabled = page >= pages || isPending

  return (
    <>
      {isPending ? (
        <div
          data-testid="leads-pagination-skeleton"
          aria-live="polite"
          className="space-y-2 py-2"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md bg-muted/60"
              aria-hidden="true"
            />
          ))}
          <p className="sr-only">Carregando próxima página…</p>
        </div>
      ) : null}
      <nav className="flex items-center justify-between py-4" aria-label="Paginação">
        <p className="text-sm text-muted-foreground">
          Página {page} de {pages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={prevDisabled}
            aria-label="Página anterior"
            className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="flex items-center text-sm px-3 tabular-nums">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              `${page} / ${pages}`
            )}
          </span>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={nextDisabled}
            aria-label="Próxima página"
            className="inline-flex items-center justify-center h-9 px-3 border rounded-lg text-sm transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </>
  )
}
