'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { X, Loader2 } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Modal({ open, onClose, title, description, size = 'md', children }: ModalProps) {
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }
  const modalRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.[0]?.focus()
    }, 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={onClose} aria-hidden />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-desc' : undefined}
        className={cn(
          'relative bg-card rounded-lg shadow-xl p-6 w-full mx-4 animate-in zoom-in-95',
          sizeMap[size]
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
            {description && <p id="modal-desc" className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-1"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  loading?: boolean
}

export function ConfirmationDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'destructive', loading,
}: ConfirmationDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex gap-3 justify-end mt-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={variant} onClick={onConfirm} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
