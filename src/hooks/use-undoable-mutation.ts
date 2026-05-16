'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'

interface UndoableResponse {
  undoToken: string
  expiresAt: string
}

interface UseUndoableMutationOptions {
  leadId: string
  undoLabel?: string
  onUndo?: () => void
}

/**
 * Wraps a mutation that returns { undoToken, expiresAt }.
 * Shows a toast with "Desfazer" button for 30s.
 */
export function useUndoableMutation({ leadId, undoLabel = 'Ação desfeita', onUndo }: UseUndoableMutationOptions) {
  const mutate = useCallback(
    async (fn: () => Promise<UndoableResponse>) => {
      const result = await fn()
      if (!result.undoToken) return result

      const ms = Math.max(0, new Date(result.expiresAt).getTime() - Date.now())

      toast.success('Concluído', {
        duration: ms || 30_000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            try {
              const res = await fetch(`/api/v1/leads/${leadId}/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ undoToken: result.undoToken }),
              })
              if (res.ok) {
                toast.success(undoLabel)
                onUndo?.()
              } else {
                const err = await res.json()
                if (err.error?.code === 'TOKEN_EXPIRED_OR_INVALID') {
                  toast.error('Tempo para desfazer expirou.')
                } else {
                  toast.error('Erro ao desfazer.')
                }
              }
            } catch {
              toast.error('Erro ao desfazer.')
            }
          },
        },
      })

      return result
    },
    [leadId, undoLabel, onUndo],
  )

  return { mutate }
}
