'use client'

import { useState, KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface TagsEditorProps {
  leadId: string
  initialTags?: string[]
}

/**
 * TASK-13 ST001 — Tags editor.
 *
 * NOTA: O schema atual de Lead não possui campo `tags` dedicado.
 * Persistimos em `enrichmentData.tags` via PATCH /leads/{id} (merge server-side).
 * Quando o schema for estendido, trocar o PATCH para usar `tags` nativo.
 */
export function TagsEditor({ leadId, initialTags = [] }: TagsEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function persist(next: string[]) {
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      })
      if (!res.ok) throw new Error('Falha ao salvar tags')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar tags')
    } finally {
      setSaving(false)
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase()
    if (!tag || tags.includes(tag)) return
    const next = [...tags, tag]
    setTags(next)
    setValue('')
    void persist(next)
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    void persist(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(value)
    } else if (e.key === 'Backspace' && !value && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              aria-label={`Remover tag ${t}`}
              onClick={() => removeTag(t)}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Digite uma tag e pressione Enter"
        disabled={saving}
      />
    </div>
  )
}
