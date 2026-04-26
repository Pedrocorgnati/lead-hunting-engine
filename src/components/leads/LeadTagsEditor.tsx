'use client'

/**
 * TASK-16/ST003 (CL-490): editor de tags customizadas do operador.
 * Limite 20 chars (client-side). Autocomplete consumindo /tags/suggest.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Tag, X } from 'lucide-react'

const MAX_LABEL = 20

interface Tag {
  id: string
  label: string
}

export function LeadTagsEditor({ leadId }: { leadId: string }) {
  const [tags, setTags] = useState<Tag[]>([])
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = async () => {
    try {
      const r = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/tags`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { tags: Tag[] } }
      setTags(json.data.tags)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  useEffect(() => {
    if (!input) {
      setSuggestions([])
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const t = setTimeout(() => {
      fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/tags/suggest?q=${encodeURIComponent(input)}`, {
        cache: 'no-store',
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((json: { data: { labels: string[] } }) => {
          setSuggestions(json.data.labels.filter((l) => !tags.some((t) => t.label === l)))
        })
        .catch(() => {})
    }, 180)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [input, leadId, tags])

  const addTag = async (raw: string) => {
    const label = raw.trim().slice(0, MAX_LABEL)
    if (!label) return
    if (tags.some((t) => t.label === label)) {
      setInput('')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/tags`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { tag: Tag } }
      setTags((prev) => [...prev, json.data.tag].sort((a, b) => a.label.localeCompare(b.label)))
      setInput('')
      setSuggestions([])
    } finally {
      setSubmitting(false)
    }
  }

  const removeTag = async (label: string) => {
    const prev = tags
    setTags((t) => t.filter((x) => x.label !== label))
    const r = await fetch(
      `/api/v1/leads/${encodeURIComponent(leadId)}/tags?label=${encodeURIComponent(label)}`,
      { method: 'DELETE' },
    )
    if (!r.ok) setTags(prev)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      void addTag(input)
    }
  }

  return (
    <section data-testid="lead-tags-editor" className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Tags</h3>
        <span className="text-xs text-muted-foreground">
          ({tags.length}) · até {MAX_LABEL} chars
        </span>
      </header>

      <div className="mt-3 flex flex-wrap gap-2">
        {loading ? (
          <span className="text-xs text-muted-foreground">Carregando…</span>
        ) : tags.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sem tags</span>
        ) : (
          tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
              data-testid={`lead-tag-${t.label}`}
            >
              {t.label}
              <button
                type="button"
                onClick={() => void removeTag(t.label)}
                aria-label={`Remover tag ${t.label}`}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="mt-3 relative">
        <input
          type="text"
          value={input}
          maxLength={MAX_LABEL}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={submitting}
          placeholder="Digite e Enter para adicionar"
          aria-label="Nova tag"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          data-testid="lead-tag-input"
        />
        {suggestions.length > 0 ? (
          <ul
            className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md"
            role="listbox"
          >
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => void addTag(s)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
