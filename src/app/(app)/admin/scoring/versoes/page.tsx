'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Routes } from '@/lib/constants'

interface VersionEntry {
  id: string
  ruleId: string
  snapshot: Record<string, unknown>
  changedBy: string | null
  changeReason: string | null
  createdAt: string
  rule?: {
    name: string
    slug: string
  }
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function SnapshotDiff({ snapshot }: { snapshot: Record<string, unknown> }) {
  const entries = Object.entries(snapshot).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Snapshot vazio.</p>
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="font-mono truncate">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function ScoringVersionsPage() {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/scoring/rules/versions', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data?: { versions?: VersionEntry[] } }
        setVersions(json.data?.versions ?? [])
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href={Routes.ADMIN_CONFIG_SCORING}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao editor
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Historico de versoes</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as alteracoes nas regras de scoring ao longo do tempo.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8" aria-busy="true">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando historico...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive py-4">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span role="alert">Erro ao carregar: {error}</span>
        </div>
      )}

      {!loading && !error && versions && versions.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">Nenhuma alteracao registrada ainda.</p>
      )}

      {!loading && !error && versions && versions.length > 0 && (
        <div className="space-y-3">
          {versions.map((v) => {
            const isOpen = expanded.has(v.id)
            const ruleName = v.rule?.name ?? v.ruleId.slice(0, 8)
            return (
              <div key={v.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ruleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(v.createdAt)}
                      {v.changedBy && ` · por ${v.changedBy.slice(0, 8)}`}
                      {v.changeReason && ` · ${v.changeReason}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(v.id)}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {isOpen ? 'Ocultar' : 'Ver snapshot'}
                  </button>
                </div>
                {isOpen && <SnapshotDiff snapshot={v.snapshot} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
