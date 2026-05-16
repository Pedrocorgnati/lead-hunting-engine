'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react'

interface DlqJob {
  id: string
  provider: string
  lastError: string | null
  failedAt: string | null
  retryCount: number
  status: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function DlqPage() {
  const [jobs, setJobs] = useState<DlqJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requeuing, setRequeuing] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20' })
      if (provider) qs.set('provider', provider)
      const res = await fetch(`/api/v1/admin/dlq?${qs}`)
      if (!res.ok) throw new Error('Erro ao carregar DLQ')
      const data = await res.json()
      setJobs(data.items)
      setTotal(data.total)
    } catch {
      setError('Erro ao carregar jobs da DLQ.')
    } finally {
      setLoading(false)
    }
  }, [page, provider])

  useEffect(() => { load() }, [load])

  async function requeue(id: string) {
    setRequeuing(id)
    setConfirmId(null)
    try {
      const res = await fetch(`/api/v1/admin/dlq/${id}/requeue`, { method: 'POST' })
      if (!res.ok) throw new Error('Falha')
      await load()
    } catch {
      alert('Erro ao reenfileirar job.')
    } finally {
      setRequeuing(null)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dead Letter Queue</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Atualizar"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Filtrar por provider..."
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(1) }}
          className="rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filtrar por provider"
        />
        <span className="text-sm text-muted-foreground self-center">{total} jobs</span>
      </div>

      {loading && (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          Sem jobs em DLQ — tudo limpo.
        </p>
      )}

      {!loading && jobs.length > 0 && (
        <div className="rounded border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Provider</th>
                <th className="px-4 py-2 text-left font-medium">Erro</th>
                <th className="px-4 py-2 text-left font-medium">Falhou em</th>
                <th className="px-4 py-2 text-left font-medium">Tentativas</th>
                <th className="px-4 py-2 text-left font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{job.id.slice(0, 8)}…</td>
                  <td className="px-4 py-2">{job.provider}</td>
                  <td className="px-4 py-2 max-w-xs truncate text-destructive" title={job.lastError ?? ''}>
                    {job.lastError ?? '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(job.failedAt)}</td>
                  <td className="px-4 py-2">{job.retryCount}</td>
                  <td className="px-4 py-2">
                    {confirmId === job.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => requeue(job.id)}
                          disabled={requeuing === job.id}
                          className="text-xs text-primary underline"
                        >
                          Confirmar
                        </button>
                        <button onClick={() => setConfirmId(null)} className="text-xs text-muted-foreground underline">
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmId(job.id)}
                        disabled={requeuing === job.id}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                        aria-label={`Reenfileirar job ${job.id}`}
                      >
                        {requeuing === job.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          'Requeue'
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm underline disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-muted-foreground">Página {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 20 >= total}
            className="text-sm underline disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
