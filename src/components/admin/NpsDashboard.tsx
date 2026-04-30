'use client'

import { useEffect, useMemo, useState } from 'react'

type Period = '7d' | '30d' | '90d' | 'custom'
type Bucket = 'all' | 'detractor' | 'passive' | 'promoter'

interface Aggregate {
  totalResponses: number
  npsScore: number
  distribution: number[]
  detractors: number
  passives: number
  promoters: number
  averageScore: number
}

interface CommentEntry {
  id: string
  score: number
  bucket: 'detractor' | 'passive' | 'promoter'
  comment: string | null
  submittedAt: string
  userMaskedEmail: string
}

interface DashboardData {
  period: Period
  aggregate: Aggregate
  comments: CommentEntry[]
}

export function NpsDashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const [bucket, setBucket] = useState<Bucket>('all')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ period })
    if (bucket !== 'all') params.set('bucket', bucket)

    fetch(`/api/v1/admin/feedback/nps?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DashboardData>
      })
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })

    return () => {
      cancelled = true
    }
  }, [period, bucket, requestId])

  // Reset data when filters change to drive the loading UI without
  // calling setState synchronously inside the effect.
  const filtersKey = `${period}|${bucket}`
  const [lastKey, setLastKey] = useState(filtersKey)
  if (filtersKey !== lastKey) {
    setLastKey(filtersKey)
    setData(null)
    setRequestId((n) => n + 1)
  }
  const loading = data === null && error === null

  const maxBar = useMemo(() => {
    if (!data) return 1
    return Math.max(1, ...data.aggregate.distribution)
  }, [data])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Periodo"
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          <option value="7d">Ultimos 7 dias</option>
          <option value="30d">Ultimos 30 dias</option>
          <option value="90d">Ultimos 90 dias</option>
        </select>
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as Bucket)}
          aria-label="Bucket"
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          <option value="all">Todos</option>
          <option value="detractor">Detractors (0-6)</option>
          <option value="passive">Passives (7-8)</option>
          <option value="promoter">Promoters (9-10)</option>
        </select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="text-sm text-red-600">Erro: {error}</p>}

      {data && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card label="NPS Score" value={data.aggregate.npsScore.toString()} hint="-100..100" />
            <Card
              label="Respostas"
              value={data.aggregate.totalResponses.toString()}
              hint={`Media ${data.aggregate.averageScore.toFixed(1)}`}
            />
            <Card
              label="Detractors"
              value={data.aggregate.detractors.toString()}
              hint={pct(data.aggregate.detractors, data.aggregate.totalResponses)}
              tone="danger"
            />
            <Card
              label="Promoters"
              value={data.aggregate.promoters.toString()}
              hint={pct(data.aggregate.promoters, data.aggregate.totalResponses)}
              tone="success"
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">Distribuicao 0-10</h2>
            <div className="space-y-1">
              {data.aggregate.distribution.map((count, score) => (
                <div key={score} className="flex items-center gap-2 text-xs">
                  <span className="w-6 font-mono">{score}</span>
                  <div className="h-3 flex-1 bg-gray-100">
                    <div
                      className="h-3 bg-blue-500"
                      style={{ width: `${(count / maxBar) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-gray-500">{count}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">
              Comentarios{bucket !== 'all' ? ` — ${bucket}` : ''}
            </h2>
            {data.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum comentario encontrado.</p>
            ) : (
              <ul className="space-y-2">
                {data.comments.map((c) => (
                  <li key={c.id} className="rounded border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500">
                        {c.userMaskedEmail} · {new Date(c.submittedAt).toLocaleDateString('pt-BR')}
                      </span>
                      <BucketBadge bucket={c.bucket} score={c.score} />
                    </div>
                    {c.comment ? (
                      <p className="mt-2 text-gray-700">{c.comment}</p>
                    ) : (
                      <p className="mt-2 italic text-gray-400">(sem comentario)</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'success' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-700'
      : tone === 'danger'
        ? 'text-red-700'
        : 'text-gray-900'
  return (
    <div className="rounded border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function BucketBadge({ bucket, score }: { bucket: CommentEntry['bucket']; score: number }) {
  const label =
    bucket === 'detractor'
      ? 'Detractor'
      : bucket === 'passive'
        ? 'Passive'
        : 'Promoter'
  const cls =
    bucket === 'detractor'
      ? 'bg-red-100 text-red-700'
      : bucket === 'passive'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-green-100 text-green-700'
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label} {score}
    </span>
  )
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}
