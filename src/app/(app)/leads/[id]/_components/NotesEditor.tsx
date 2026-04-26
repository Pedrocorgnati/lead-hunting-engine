'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface NotesEditorProps {
  leadId: string
  initialNotes?: string | null
}

/**
 * Render markdown simples (cabeçalhos, negrito, itálico, links, listas).
 * Implementação minimalista sem dependência externa (react-markdown não instalado).
 */
function renderMarkdown(md: string): string {
  if (!md) return ''
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  let html = escape(md)
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/^\- (.*)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
  html = html.replace(/\n/g, '<br/>')
  return html
}

export function NotesEditor({ leadId, initialNotes }: NotesEditorProps) {
  const [value, setValue] = useState(initialNotes ?? '')
  const [saved, setSaved] = useState(initialNotes ?? '')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value === saved) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/v1/leads/${leadId}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
        })
        if (!res.ok) throw new Error('Falha ao salvar anotações')
        setSaved(value)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
      } finally {
        setSaving(false)
      }
    }, 500)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, saved, leadId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button size="sm" variant={mode === 'edit' ? 'default' : 'outline'} onClick={() => setMode('edit')}>
            Editar
          </Button>
          <Button size="sm" variant={mode === 'preview' ? 'default' : 'outline'} onClick={() => setMode('preview')}>
            Preview
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {saving ? 'Salvando...' : value === saved ? 'Salvo' : 'Editando...'}
        </span>
      </div>
      {mode === 'edit' ? (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          maxLength={2000}
          placeholder="Anotações em markdown..."
        />
      ) : (
        <div
          className="prose prose-sm max-w-none rounded-md border bg-muted/30 p-3"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      )}
      <p className="text-xs text-muted-foreground">{value.length}/2000</p>
    </div>
  )
}
