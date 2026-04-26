'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Routes } from '@/lib/constants'

interface SiteAuditShape {
  lighthouseScore?: number | null
}

interface GoogleReviewsShape {
  reviewCount?: number | null
  avgRating?: number | null
}

interface AdsStatusShape {
  metaActive?: boolean | null
  googleActive?: boolean | null
}

interface CompetitorRow {
  id: string
  businessName: string
  city: string | null
  state: string | null
  niche: string | null
  category: string | null
  score: number
  temperature: 'COLD' | 'WARM' | 'HOT'
  reviewCount: number | null
  rating: number | string | null
  siteAudit: SiteAuditShape | null
  googleReviews: GoogleReviewsShape | null
  techStack: string[]
  adsStatus: AdsStatusShape | null
}

interface CompetitorsResponse {
  baseLead: {
    id: string
    score: number
    niche: string | null
    city: string | null
  }
  competitors: CompetitorRow[]
}

interface Props {
  leadId: string
}

const TEMP_LABEL: Record<string, string> = {
  COLD: 'Frio',
  WARM: 'Morno',
  HOT: 'Quente',
}

function formatLighthouse(row: CompetitorRow): string {
  const v = row.siteAudit?.lighthouseScore
  return typeof v === 'number' ? `${v}/100` : '—'
}

function formatReviews(row: CompetitorRow): string {
  const count = row.googleReviews?.reviewCount ?? row.reviewCount
  const rating = row.googleReviews?.avgRating ?? (row.rating != null ? Number(row.rating) : null)
  if (count == null) return '—'
  if (rating == null) return String(count)
  return `${rating.toFixed(1)} (${count})`
}

function formatAds(row: CompetitorRow): string {
  const meta = row.adsStatus?.metaActive
  const google = row.adsStatus?.googleActive
  const labels: string[] = []
  if (meta === true) labels.push('Meta')
  if (google === true) labels.push('Google')
  if (labels.length === 0 && meta === null && google === null) return '—'
  return labels.length > 0 ? labels.join(' + ') : 'Sem anúncios'
}

/**
 * Painel comparativo de concorrentes — TASK-5 intake-review (CL-080).
 * Consome GET /api/v1/leads/[id]/competitors.
 */
export function CompetitorsPanel({ leadId }: Props) {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error' | 'empty'
    data: CompetitorsResponse | null
    message: string | null
  }>({ status: 'loading', data: null, message: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/v1/leads/${leadId}/competitors`, { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error', data: null, message: `Falha ao carregar (${res.status})` })
          return
        }
        const json = (await res.json()) as { data?: CompetitorsResponse }
        if (cancelled) return
        if (!json.data || json.data.competitors.length === 0) {
          setState({ status: 'empty', data: json.data ?? null, message: null })
        } else {
          setState({ status: 'success', data: json.data, message: null })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            message: err instanceof Error ? err.message : 'Erro desconhecido',
          })
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
    <section
      data-testid="competitors-panel"
      className="rounded-lg border border-border bg-card p-4 sm:p-6 space-y-4"
      aria-labelledby="competitors-panel-title"
    >
      <header>
        <h2 id="competitors-panel-title" className="text-lg font-semibold text-foreground">
          Concorrentes próximos
        </h2>
        <p className="text-sm text-muted-foreground">
          Até 5 leads no mesmo nicho e cidade, ordenados por score similar.
        </p>
      </header>

      {state.status === 'loading' && (
        <p data-testid="competitors-panel-loading" className="text-sm text-muted-foreground">
          Carregando concorrentes...
        </p>
      )}

      {state.status === 'error' && (
        <div
          data-testid="competitors-panel-error"
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Não foi possível carregar concorrentes.
          {state.message ? ` (${state.message})` : ''}
        </div>
      )}

      {state.status === 'empty' && (
        <p data-testid="competitors-panel-empty" className="text-sm text-muted-foreground">
          Nenhum concorrente encontrado no mesmo nicho e cidade.
        </p>
      )}

      {state.status === 'success' && state.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="competitors-panel-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Negócio</th>
                <th className="py-2 pr-3 font-medium">Cidade</th>
                <th className="py-2 pr-3 font-medium">Score</th>
                <th className="py-2 pr-3 font-medium">Temperatura</th>
                <th className="py-2 pr-3 font-medium">Lighthouse</th>
                <th className="py-2 pr-3 font-medium">Reviews</th>
                <th className="py-2 pr-3 font-medium">Anúncios</th>
                <th className="py-2 pr-3 font-medium">Stack</th>
              </tr>
            </thead>
            <tbody>
              {state.data.competitors.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`${Routes.LEADS}/${row.id}`}
                      className="text-foreground hover:underline"
                    >
                      {row.businessName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {row.city ?? '—'}
                    {row.state ? ` / ${row.state}` : ''}
                  </td>
                  <td className="py-2 pr-3 font-medium text-foreground">{row.score}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {TEMP_LABEL[row.temperature] ?? row.temperature}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatLighthouse(row)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatReviews(row)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatAds(row)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {row.techStack.length > 0 ? row.techStack.slice(0, 3).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
