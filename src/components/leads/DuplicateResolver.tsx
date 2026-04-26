'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface LeadSummary {
  id: string
  businessName: string | null
  category: string | null
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  email: string | null
  score: number | null
}

interface DuplicatePair {
  id: string
  similarity: number
  reasons: string[]
  status: 'PENDING' | 'MERGED' | 'KEEP_BOTH' | 'REJECTED' | 'UNDONE'
  mergedAt: string | null
  primary: LeadSummary | null
  candidate: LeadSummary | null
}

type Action = 'MERGE' | 'KEEP_BOTH' | 'REJECT'

const FIELDS: Array<{ key: keyof LeadSummary; label: string }> = [
  { key: 'businessName', label: 'Nome' },
  { key: 'category', label: 'Categoria' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Site' },
  { key: 'score', label: 'Score' },
]

export function DuplicateResolver() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/v1/leads/duplicates?status=PENDING&page=${page}&limit=10`
      )
      if (!res.ok) throw new Error('Falha ao listar')
      const json = await res.json()
      setPairs(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  async function resolve(
    pair: DuplicatePair,
    action: Action,
    primaryLeadId?: string
  ) {
    setBusyId(pair.id)
    try {
      const res = await fetch(`/api/v1/leads/duplicates/${pair.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, primaryLeadId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao resolver')
      }
      toast.success(
        action === 'MERGE'
          ? 'Leads mesclados.'
          : action === 'KEEP_BOTH'
            ? 'Ambos os leads mantidos.'
            : 'Par descartado.'
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum candidato pendente. Tudo em dia.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pairs.map((pair) => (
        <article
          key={pair.id}
          data-testid={`duplicate-pair-${pair.id}`}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Similaridade</Badge>
              <span className="font-semibold">
                {(pair.similarity * 100).toFixed(1)}%
              </span>
              {pair.reasons.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({pair.reasons.join(', ')})
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === pair.id}
                onClick={() => resolve(pair, 'KEEP_BOTH')}
              >
                Manter ambos
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                disabled={busyId === pair.id}
                onClick={() => resolve(pair, 'REJECT')}
              >
                Descartar
              </Button>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            {[pair.primary, pair.candidate].map((lead, idx) => {
              if (!lead) return null
              const other = idx === 0 ? pair.candidate : pair.primary
              return (
                <div
                  key={lead.id}
                  className="space-y-3 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">
                        {idx === 0 ? 'Primary' : 'Candidato'}
                      </div>
                      <div className="font-medium">
                        {lead.businessName ?? '—'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={busyId === pair.id}
                      onClick={() => resolve(pair, 'MERGE', lead.id)}
                    >
                      Manter este e mesclar
                    </Button>
                  </div>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-xs">
                    {FIELDS.map((f) => {
                      const own = lead[f.key]
                      const opp = other?.[f.key]
                      const diverge = own !== opp
                      return (
                        <div
                          key={f.key}
                          className={
                            'contents ' +
                            (diverge ? 'font-semibold' : 'text-muted-foreground')
                          }
                        >
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd
                            className={
                              diverge ? 'text-foreground' : 'text-muted-foreground'
                            }
                          >
                            {(own ?? '') === '' ? '—' : String(own)}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </div>
              )
            })}
          </div>
        </article>
      ))}

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Pagina {page} · {total} pendentes
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pairs.length < 10}
            onClick={() => setPage((p) => p + 1)}
          >
            Proxima
          </Button>
        </div>
      </div>
    </div>
  )
}
