'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/use-toast'

interface PitchVersion {
  id: string
  leadId: string
  content: string
  tone: string | null
  provider: string | null
  changedBy: string | null
  createdAt: string
}

interface Props {
  leadId: string
  open: boolean
  onClose: () => void
  onRestored?: (content: string, tone: string | null) => void
}

export function PitchHistoryDrawer({ leadId, open, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<PitchVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/leads/${leadId}/pitch/history`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: { versions: PitchVersion[] } }
        if (!cancelled) setVersions(json.data.versions)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, leadId])

  async function handleRestore(versionId: string) {
    setRestoring(versionId)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/pitch/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        data: { lead: { pitchContent: string | null; pitchTone: string | null } }
      }
      toast.success('Versao restaurada.')
      onRestored?.(json.data.lead.pitchContent ?? '', json.data.lead.pitchTone)
      onClose()
    } catch (e) {
      toast.error(`Nao foi possivel restaurar: ${(e as Error).message}`)
    } finally {
      setRestoring(null)
    }
  }

  if (!open) return null

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-lg"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">Versoes anteriores do pitch</h2>
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
          Fechar
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {error && <p className="text-sm text-destructive">Erro: {error}</p>}
        {!loading && !error && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma versao anterior registrada.</p>
        )}
        {!loading && !error && versions.length > 0 && (
          <ul className="space-y-3">
            {versions.map((v) => (
              <li key={v.id} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(v.createdAt).toLocaleString('pt-BR')}</span>
                  {v.tone && <span className="rounded bg-muted px-2 py-0.5">{v.tone}</span>}
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm">{v.content}</p>
                <button
                  type="button"
                  onClick={() => handleRestore(v.id)}
                  disabled={restoring === v.id}
                  className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {restoring === v.id ? 'Restaurando...' : 'Restaurar esta versao'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
