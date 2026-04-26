'use client'

/**
 * JobCostBadge — badge com custo agregado de um CollectionJob.
 *
 * Origem: TASK-12 intake-review / ST004 (CL-184).
 *
 * - Polling de 30s enquanto status === 'RUNNING' (ECU: estado live).
 * - Loading/empty/error cobertos (Regra Zero Estados Indefinidos).
 * - Tooltip expandivel com breakdown LLM vs API.
 */

import { useEffect, useState, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CostResponse {
  jobId: string
  llm: {
    calls: number
    costUsd: string
    inputTokens: number
    outputTokens: number
  }
  api: Array<{
    provider: string
    callType: string
    calls: number
    credits: number
  }>
}

interface JobCostBadgeProps {
  jobId: string
  status: string
  /** Override do intervalo de polling (ms). Default 30s. */
  pollIntervalMs?: number
}

function usdToBrl(usd: number, rate = 5.1): string {
  return (usd * rate).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function fmtUsd(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

export function JobCostBadge({ jobId, status, pollIntervalMs = 30_000 }: JobCostBadgeProps) {
  const [data, setData] = useState<CostResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/v1/jobs/${jobId}/cost`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: CostResponse }
        if (!cancelled) {
          setData(json.data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled && (err as Error).name !== 'AbortError') {
          setError('Nao foi possivel carregar custo.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    // Poll apenas enquanto RUNNING
    let interval: ReturnType<typeof setInterval> | null = null
    if (status === 'RUNNING') {
      interval = setInterval(load, pollIntervalMs)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [jobId, status, pollIntervalMs])

  if (loading) {
    return (
      <Badge variant="secondary" aria-busy="true" data-testid="job-cost-badge-loading">
        Custo: ...
      </Badge>
    )
  }

  if (error || !data) {
    return (
      <Badge variant="outline" data-testid="job-cost-badge-error" title={error ?? 'sem dados'}>
        Custo: —
      </Badge>
    )
  }

  const llmUsd = Number(data.llm.costUsd || '0')
  const apiCalls = data.api.reduce((acc, row) => acc + row.calls, 0)
  const totalUsd = llmUsd
  const label = `${fmtUsd(totalUsd)} / ${usdToBrl(totalUsd)}`

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="secondary"
            data-testid="job-cost-badge"
            aria-label={`Custo estimado da coleta: ${label}`}
          >
            Custo: {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="space-y-1">
            <p className="font-semibold">Breakdown</p>
            <p>
              LLM: {fmtUsd(llmUsd)} ({data.llm.calls} calls ·{' '}
              {data.llm.inputTokens + data.llm.outputTokens} tokens)
            </p>
            <p>
              API: {apiCalls} chamadas
              {data.api.length > 0
                ? ` (${data.api.map((r) => `${r.provider}/${r.callType}`).join(', ')})`
                : ''}
            </p>
            <p className="opacity-70">BRL estimado usa cotacao fixa (USD 5,10).</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
