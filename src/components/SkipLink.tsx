'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface SkipLinkProps {
  /** ID of the main content element to skip to. Defaults to "main-content". */
  targetId?: string
  label?: string
  className?: string
}

/**
 * SkipLink — link de acessibilidade que aparece apenas no foco do teclado.
 * Posicionar no topo do layout antes do <header> para satisfazer WCAG 2.4.1.
 * O elemento alvo (targetId) deve ter tabIndex={-1} para receber foco.
 */
export function SkipLink({ targetId = 'main-content', label = 'Pular para o conteudo principal', className }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999]',
        'focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring',
        className,
      )}
      data-testid="skip-link"
    >
      {label}
    </a>
  )
}
