'use client'

/**
 * TASK-16/ST004 (CL-267): barra de visoes salvas.
 * Usa searchParams atuais como `filters` ao salvar; clica para aplicar.
 */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bookmark, Loader2, Save, X } from 'lucide-react'

interface SavedView {
  id: string
  name: string
  filters: Record<string, unknown>
  createdAt: string
}

function paramsToFilters(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  sp.forEach((v, k) => {
    if (k !== 'page') out[k] = v
  })
  return out
}

function filtersToQuery(filters: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && String(v).length > 0) sp.set(k, String(v))
  }
  return sp.toString()
}

export function SavedViewsBar({ basePath = '/leads' }: { basePath?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)

  const load = async () => {
    try {
      const r = await fetch('/api/v1/views', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { views: SavedView[] } }
      setViews(json.data.views)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const r = await fetch('/api/v1/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          filters: paramsToFilters(searchParams),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
      setName('')
      setShowSaveForm(false)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    const prev = views
    setViews((v) => v.filter((x) => x.id !== id))
    const r = await fetch(`/api/v1/views/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) setViews(prev)
  }

  const apply = (v: SavedView) => {
    const qs = filtersToQuery(v.filters)
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
  }

  return (
    <div
      data-testid="saved-views-bar"
      className="flex flex-wrap items-center gap-2"
      aria-label="Visões salvas"
    >
      <Bookmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : views.length === 0 ? (
        <span className="text-xs text-muted-foreground">Nenhuma visão salva ainda</span>
      ) : (
        views.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => apply(v)}
              className="hover:underline"
              data-testid={`saved-view-apply-${v.name}`}
            >
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => void remove(v.id)}
              aria-label={`Remover visão ${v.name}`}
              className="opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))
      )}

      {showSaveForm ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Nome da visão"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            data-testid="saved-view-name"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setShowSaveForm(false)}
            className="text-xs text-muted-foreground"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowSaveForm(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs hover:bg-accent"
          data-testid="saved-view-save"
        >
          <Save className="h-3 w-3" aria-hidden="true" />
          Salvar visão
        </button>
      )}
    </div>
  )
}
