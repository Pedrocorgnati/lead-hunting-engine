'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const firstFocusableRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    firstFocusableRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        data-testid="bottom-sheet-overlay"
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="bottom-sheet"
        className={cn(
          'fixed bottom-0 inset-x-0 z-50 max-h-[85dvh] overflow-y-auto',
          'rounded-t-2xl bg-background border-t border-border shadow-xl',
          'md:hidden',
          className
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        </div>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <button
              ref={firstFocusableRef}
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {/* Content */}
        <div className="p-4">{children}</div>
      </div>
    </>
  )
}
