'use client'

import { useState, useMemo } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  confirmationPhrase?: string
  onConfirm: (reason: string) => void | Promise<void>
}

export function SaveClassificationModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Salvar',
  danger = false,
  loading = false,
  confirmationPhrase,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  const reasonValid = useMemo(() => reason.trim().length >= 5, [reason])

  const handleConfirm = async () => {
    if (!reasonValid) {
      setReasonError('Informe o motivo da alteracao (minimo 5 caracteres).')
      return
    }
    setReasonError(null)
    await onConfirm(reason.trim())
    setReason('')
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('')
        onOpenChange(v)
      }}
      title={title}
      description={
        <div className="space-y-3">
          {description && <p>{description}</p>}
          <div className="space-y-2">
            <Label htmlFor="save-reason">Motivo da alteracao</Label>
            <Textarea
              id="save-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(null)
              }}
              placeholder="Descreva o motivo da mudanca (minimo 5 caracteres)"
              rows={3}
              aria-invalid={reasonError ? 'true' : 'false'}
              aria-describedby={reasonError ? 'save-reason-error' : undefined}
            />
            <div id="save-reason-error" aria-live="polite" role="status" className="min-h-5 text-sm text-destructive">
              {reasonError}
            </div>
          </div>
        </div>
      }
      confirmLabel={confirmLabel}
      danger={danger}
      loading={loading}
      confirmationPhrase={confirmationPhrase}
      onConfirm={() => void handleConfirm()}
    />
  )
}
