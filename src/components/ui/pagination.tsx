'use client'
import { Button } from './button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  total: number
  limit: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  if (totalPages <= 1) return null

  return (
    <nav className="flex items-center justify-between py-4" aria-label="Paginação">
      <p className="text-sm text-muted-foreground">
        Mostrando {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline" size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex items-center text-sm px-3">{page} / {totalPages}</span>
        <Button
          variant="outline" size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
