'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  href: string
  kind: 'lead' | 'job' | 'template'
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const json = await res.json()
        setResults(json.data ?? [])
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  function go(r: SearchResult) {
    setOpen(false)
    setQuery('')
    router.push(r.href)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Busca global</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b pb-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar leads, coletas, templates... (Ctrl+K)"
            className="border-0 focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-auto">
          {loading && <p className="p-2 text-sm text-muted-foreground">Buscando...</p>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Nenhum resultado.</p>
          )}
          <ul>
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => go(r)}
                  className="flex w-full flex-col items-start gap-0 rounded-md p-2 text-left hover:bg-muted"
                >
                  <span className="text-sm font-medium">{r.title}</span>
                  {r.subtitle && (
                    <span className="text-xs text-muted-foreground">
                      {r.kind} · {r.subtitle}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
