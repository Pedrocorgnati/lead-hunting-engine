'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface HistoryEntry {
  id: string
  ruleId: string
  snapshot: Record<string, unknown>
  changedBy: string | null
  changeReason: string | null
  createdAt: string
}

interface Response {
  ruleId: string
  history: HistoryEntry[]
}

interface Props {
  ruleId: string
  open: boolean
  onClose: () => void
  /**
   * Callback disparado quando o admin confirma "Reverter" uma versao
   * historica. Recebe o peso a aplicar. O pai e responsavel por ajustar
   * os demais pesos para somar 100% antes de persistir.
   */
  onRevert?: (weight: number, entry: HistoryEntry) => void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'vazio'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function diffPairs(curr: Record<string, unknown>, prev: Record<string, unknown>) {
  const keys = new Set([...Object.keys(curr), ...Object.keys(prev)])
  const rows: Array<{ key: string; from: string; to: string; changed: boolean }> = []
  for (const key of keys) {
    if (['id', 'createdAt', 'updatedAt'].includes(key)) continue
    const a = formatValue(prev[key])
    const b = formatValue(curr[key])
    rows.push({ key, from: a, to: b, changed: a !== b })
  }
  return rows
}

export function ScoringRuleHistoryModal({ ruleId, open, onClose, onRevert }: Props) {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRevert, setPendingRevert] = useState<HistoryEntry | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/admin/config/scoring-rules/${ruleId}/history`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: Response }
        if (!cancelled) setData(json.data)
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
  }, [open, ruleId])

  const confirmRevert = () => {
    if (!pendingRevert) return
    const weight = pendingRevert.snapshot.weight
    if (typeof weight !== 'number') {
      setPendingRevert(null)
      return
    }
    onRevert?.(weight, pendingRevert)
    setPendingRevert(null)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      data-testid="scoring-rule-history-modal"
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Historico de alteracoes</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Fechar
          </button>
        </header>

        {loading && <p className="text-sm text-muted-foreground">Carregando historico...</p>}
        {error && <p className="text-sm text-destructive">Erro: {error}</p>}

        {!loading && !error && data && data.history.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem alteracoes registradas.</p>
        )}

        {!loading && !error && data && data.history.length > 0 && (
          <ol className="space-y-4">
            {data.history.map((entry, idx) => {
              const next = idx === 0 ? null : data.history[idx - 1]
              const currentSnap = (next?.snapshot ?? entry.snapshot) as Record<string, unknown>
              const prevSnap = entry.snapshot as Record<string, unknown>
              const rows = diffPairs(currentSnap, prevSnap).filter((r) => r.changed)
              const snapshotWeight = prevSnap.weight
              const canRevert =
                typeof snapshotWeight === 'number' && Boolean(onRevert)
              return (
                <li key={entry.id} className="rounded border p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(entry.createdAt).toLocaleString('pt-BR')}</span>
                    {entry.changedBy && <span>por {entry.changedBy.slice(0, 8)}</span>}
                  </div>
                  {entry.changeReason && (
                    <p className="mb-2 text-sm italic">{entry.changeReason}</p>
                  )}
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem diff visual.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.key} className="border-b last:border-0">
                            <td className="py-1 font-medium">{r.key}</td>
                            <td className="py-1 text-red-600 line-through">{r.from}</td>
                            <td className="py-1 text-green-600">-&gt; {r.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {canRevert && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => setPendingRevert(entry)}
                        data-testid={`scoring-rule-history-revert-${entry.id}`}
                      >
                        Reverter peso ({String(snapshotWeight)}%)
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {pendingRevert && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revert-confirm-title"
          onClick={() => setPendingRevert(null)}
          data-testid="scoring-rule-history-revert-confirm"
        >
          <div
            className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="revert-confirm-title" className="text-base font-semibold">
              Reverter para versao de{' '}
              {new Date(pendingRevert.createdAt).toLocaleString('pt-BR')}?
            </h3>
            <p className="text-sm text-muted-foreground">
              O peso desta regra voltara a {String(pendingRevert.snapshot.weight)}%. Ajuste
              os pesos das outras regras para totalizar 100% antes de salvar.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setPendingRevert(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmRevert}
                data-testid="scoring-rule-history-revert-confirm-button"
              >
                Confirmar revert
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
