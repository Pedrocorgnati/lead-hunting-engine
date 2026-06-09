'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Download, Loader2, MapPin, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Routes } from '@/lib/constants'

interface Lead {
  id: string
  businessName: string
  score: number
  status: string
  city: string | null
  state: string | null
  source?: string
}

interface CompareResponse {
  data?: { leads: Lead[] }
  error?: { code: string; message: string }
}

const MAX_COMPARE = 4

function LeadCompareInner() {
  const searchParams = useSearchParams()
  const rawIds = searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const idsParam = rawIds.join(',')

  const load = useCallback(async () => {
    if (rawIds.length === 0) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/leads/compare?ids=${encodeURIComponent(idsParam)}`)
      const json = (await res.json().catch(() => ({}))) as CompareResponse
      if (!res.ok) {
        setError(json.error?.message || 'Erro ao carregar comparacao.')
        setLeads([])
        return
      }
      setLeads(json.data?.leads ?? [])
    } catch {
      setError('Erro ao carregar leads para comparacao.')
    } finally {
      setLoading(false)
    }
  }, [idsParam, rawIds.length])

  useEffect(() => { void load() }, [load])

  if (rawIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Nenhum lead selecionado. Acesse{' '}
        <Link href={Routes.LEADS} className="underline">Leads</Link>{' '}
        e selecione para comparar.
      </p>
    )
  }

  if (rawIds.length < 2) {
    return (
      <div role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning flex items-center gap-2">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        Selecione pelo menos 2 leads para comparar.
      </div>
    )
  }

  if (rawIds.length > MAX_COMPARE) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        Limite maximo de {MAX_COMPARE} leads por comparacao. Ajuste a selecao.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && leads.length > 0 && (
        <div className="space-y-4">
          {/* Diff comparison table */}
          {leads.length >= 2 && (
            <Card data-testid="compare-table">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Comparativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 text-muted-foreground font-normal">Atributo</th>
                        {leads.map((lead) => (
                          <th key={lead.id} className="text-left py-2 pr-4 font-medium">{lead.businessName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2 pr-4 text-muted-foreground">Score</td>
                        {leads.map((lead) => {
                          const maxScore = Math.max(...leads.map((l) => l.score))
                          const isBest = lead.score === maxScore && leads.length > 1
                          return (
                            <td key={lead.id} className={`py-2 pr-4 font-medium ${isBest ? 'text-green-600 dark:text-green-400' : ''}`}>
                              {lead.score} {isBest && '(melhor)'}
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 pr-4 text-muted-foreground">Status</td>
                        {leads.map((lead) => (
                          <td key={lead.id} className="py-2 pr-4">{lead.status}</td>
                        ))}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 pr-4 text-muted-foreground">Cidade</td>
                        {leads.map((lead) => (
                          <td key={lead.id} className="py-2 pr-4">{lead.city ?? '-'}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Origem</td>
                        {leads.map((lead) => (
                          <td key={lead.id} className="py-2 pr-4">{lead.source ?? 'Nao informada'}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Individual cards with provenance */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead) => (
              <Card key={lead.id} data-testid={`compare-lead-${lead.id}`}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">{lead.businessName}</CardTitle>
                  {lead.source && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {lead.source}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  <dl className="space-y-1 text-xs">
                    <div><dt className="text-muted-foreground inline">Score:</dt> <dd className="inline font-medium">{lead.score}</dd></div>
                    <div><dt className="text-muted-foreground inline">Status:</dt> <dd className="inline">{lead.status}</dd></div>
                    {lead.city && <div><dt className="text-muted-foreground inline">Cidade:</dt> <dd className="inline">{lead.city}</dd></div>}
                  </dl>
                  <Link href={Routes.LEAD_DETAIL(lead.id)} className="text-xs underline text-muted-foreground hover:text-foreground mt-2 inline-block">Ver detalhe</Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && leads.length > 0 && (
        <div className="flex justify-end">
          <ExportCompareButton ids={rawIds} />
        </div>
      )}
    </div>
  )
}

function ExportCompareButton({ ids }: { ids: string[] }) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (ids.length === 0) return
    setExporting(true)
    try {
      const res = await fetch('/api/v1/leads/compare/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, format: 'csv' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(json.error?.message || 'Erro ao exportar comparacao.')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `leads-compare-${date}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao exportar comparacao.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="ml-1">Exportar comparacao</span>
    </Button>
  )
}

export default function ComparadorLeadsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Comparar leads</h1>
      <Suspense fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      }>
        <LeadCompareInner />
      </Suspense>
    </div>
  )
}
