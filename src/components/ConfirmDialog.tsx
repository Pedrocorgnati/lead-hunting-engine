'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  confirmationPhrase?: string
  confirmationLabel?: string
  confirmationPlaceholder?: string
  confirmationErrorMessage?: string
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  confirmationPhrase,
  confirmationLabel = 'Digite a frase de confirmação para continuar',
  confirmationPlaceholder = 'Digite exatamente a frase solicitada',
  confirmationErrorMessage = 'A frase informada não confere. Tente novamente.',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('')
  const [phraseError, setPhraseError] = useState<string | null>(null)
  const requiredPhrase = confirmationPhrase?.trim() ?? ''
  const phraseEnabled = requiredPhrase.length > 0
  const phraseMatches = useMemo(
    () => !phraseEnabled || typedPhrase.trim() === requiredPhrase,
    [phraseEnabled, requiredPhrase, typedPhrase],
  )

  useEffect(() => {
    if (!open) {
      setTypedPhrase('')
      setPhraseError(null)
    }
  }, [open])

  const handleConfirmClick = async () => {
    if (phraseEnabled && !phraseMatches) {
      setPhraseError(confirmationErrorMessage)
      return
    }
    setPhraseError(null)
    await onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {phraseEnabled && (
          <div className="space-y-2">
            <Label htmlFor="confirm-dialog-phrase">{confirmationLabel}</Label>
            <p className="text-xs text-muted-foreground break-all">
              Frase obrigatória: <code>{requiredPhrase}</code>
            </p>
            <Input
              id="confirm-dialog-phrase"
              value={typedPhrase}
              placeholder={confirmationPlaceholder}
              onChange={(event) => {
                setTypedPhrase(event.target.value)
                if (phraseError) setPhraseError(null)
              }}
              autoComplete="off"
              aria-invalid={phraseError ? 'true' : 'false'}
              aria-describedby={phraseError ? 'confirm-dialog-phrase-error' : undefined}
            />
            <div
              id="confirm-dialog-phrase-error"
              aria-live="polite"
              role="status"
              className="min-h-5 text-sm text-destructive"
            >
              {phraseError}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.()
              onOpenChange(false)
            }}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={() => void handleConfirmClick()}
            disabled={loading || (phraseEnabled && !phraseMatches)}
          >
            {loading ? 'Processando...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
