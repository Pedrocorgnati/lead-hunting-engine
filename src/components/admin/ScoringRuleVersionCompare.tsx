'use client'

import { useState } from 'react'
import { Loader2, AlertCircle, History } from 'lucide-react'
import { ScoringRuleDiffPicker } from './ScoringRuleDiff'

interface HistoryEntry {
  id: string
  ruleId: string
  snapshot: Record<string, unknown>
  changedBy?: string | null
  changeReason?: string | null
  createdAt: string
}

interface Version {
  id: string
  label: string
  data: Record<string, unknown>
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export function ScoringRuleVersionCompare({ ruleId, ruleName }: { ruleId: string; ruleName: string }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/admin/config/scoring-rules/${ruleId}/history`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('fetch')
      const json: { data?: { history?: HistoryEntry[] } } = await res.json()
      const history = json.data?.history ?? []
      setVersions(
        history.map((h) => ({
          id: h.id,
          label: `${fmt(h.createdAt)}${h.changeReason ? ` — ${h.changeReason}` : ''}`,
          data: h.snapshot,
        })),
      )
    } catch {
      setError('Erro ao carregar histórico de versões.')
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && versions === null && !loading) void load()
  }

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-controls={`history-${ruleId}`}
      >
        <History className="h-3 w-3" aria-hidden="true" />
        {open ? 'Ocultar histórico' : 'Histórico e comparação de versões'}
      </button>

      {open && (
        <div id={`history-${ruleId}`} className="mt-3" aria-label={`Histórico da regra ${ruleName}`}>
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3" aria-busy="true">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Carregando versões...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive py-3">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span role="alert">{error}</span>
              <button onClick={load} className="underline">Tentar novamente</button>
            </div>
          )}
          {!loading && !error && versions !== null && versions.length === 0 && (
            <p className="text-xs text-muted-foreground py-3">Nenhuma versão registrada ainda.</p>
          )}
          {!loading && !error && versions !== null && versions.length > 0 && (
            <ScoringRuleDiffPicker versions={versions} />
          )}
        </div>
      )}
    </div>
  )
}
