'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/utils/api-client'
import { useToast } from '@/lib/hooks/use-toast'
import { API_ROUTES } from '@/lib/constants/routes'

interface Props {
  leadId: string
  initialNotes: string
  onSaved?: (notes: string) => void
}

export function LeadNotesEditor({ leadId, initialNotes, onSaved }: Props) {
  const toast = useToast()
  const [notes, setNotes] = useState(initialNotes)
  const [saved, setSaved] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const dirty = notes !== saved

  async function handleSave() {
    setSaving(true)
    const res = await apiClient.patch(API_ROUTES.LEAD_NOTES(leadId), { notes })
    setSaving(false)

    if (res.error) {
      toast.error('Erro ao salvar notas.')
      return
    }

    setSaved(notes)
    onSaved?.(notes)
    toast.success('Notas salvas.')
  }

  return (
    <div className="space-y-2">
      <label htmlFor="lead-notes" className="text-sm font-medium">
        Notas internas
      </label>
      <textarea
        id="lead-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Adicione observações sobre este lead..."
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
        maxLength={2000}
        aria-describedby="notes-hint"
        aria-label="Notas internas do lead"
      />
      <div className="flex items-center justify-between">
        <span id="notes-hint" className="text-xs text-muted-foreground">{notes.length}/2000</span>
        {dirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px]"
            data-testid="lead-notes-save-button"
          >
            {saving ? 'Salvando...' : 'Salvar notas'}
          </Button>
        )}
      </div>
    </div>
  )
}
