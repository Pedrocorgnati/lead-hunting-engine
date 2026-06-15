import { leaseBatch, ackDone, ackFailed, reclaimExpired, sweepQueueRetention } from '@/lib/workers/local-queue'
import { captureException } from '@/lib/observability/sentry'
import { classifyError, isPermanentError } from '@/lib/workers/reason-codes'

/**
 * Core da drenagem da fila local (CL-173), compartilhado entre o cron route
 * (/api/cron/drain-local-queue) e o trigger manual admin (AD29).
 *
 * Handlers por `kind`. Novos kinds devem se registrar aqui.
 *
 * outreach-engine 06-10: falhas carregam reason_code (task 04); erros
 * permanentes (poison) nao re-tentam (task 03); retencao DONE/FAILED roda
 * oportunisticamente (task 03); batch size respeita o throttle adaptativo
 * (task 15 — alarme de fila parada reduz o lote).
 */
type Handler = (payload: unknown) => Promise<void>
const HANDLERS: Record<string, () => Promise<Handler>> = {
  // outreach-engine (06-10, task 08): envio cold-outbound por dispatch.
  // Payload minimo {dispatchId}; o worker hidrata do banco e faz o claim
  // transacional (SCHEDULED -> LOCKED) — conflito de claim nao duplica envio.
  'outreach-send': async () => {
    const mod = await import('@/lib/workers/outreach-send-worker')
    return async (payload: unknown) => {
      await mod.runOutreachSend(payload)
    }
  },
  // outreach-engine (06-10, task 12): sync de respostas inbound (IMAP).
  'outreach-reply-sync': async () => {
    const mod = await import('@/lib/workers/outreach-reply-sync-worker')
    return async (payload: unknown) => {
      await mod.runOutreachReplySync(payload)
    }
  },
  export: async () => {
    const mod = await import('@/lib/workers/export-worker')
    return async (payload: unknown) => {
      const { exportId } = payload as { exportId: string }
      await mod.runExportWorker(exportId)
    }
  },
  'budgetflow-push': async () => {
    const mod = await import('@/lib/workers/budgetflow-push-worker')
    return async (payload: unknown) => {
      const { pushId } = payload as { pushId: string }
      await mod.runBudgetFlowPush(pushId)
    }
  },
  // Money-path sem trigger.dev: coleta e processamento rodam pela fila local
  // quando TRIGGER_SECRET_KEY ausente/falho (dispatchJob faz o fallback).
  'collect-leads': async () => {
    const [collect] = await Promise.all([import('../../../trigger/tasks/collect-leads')])
    return async (payload: unknown) => {
      const consoleLogger = {
        info: (m: string, meta?: Record<string, unknown>) => console.log('[collect-leads]', m, meta ?? ''),
        warn: (m: string, meta?: Record<string, unknown>) => console.warn('[collect-leads]', m, meta ?? ''),
        error: (m: string, meta?: Record<string, unknown>) => console.error('[collect-leads]', m, meta ?? ''),
      }
      await collect.runCollection(
        payload as import('../../../trigger/tasks/collect-leads').CollectLeadsPayload,
        { ...collect.getDefaultDeps(), logger: consoleLogger },
      )
    }
  },
  'process-leads': async () => {
    const mod = await import('@/lib/workers/process-leads-core')
    return async (payload: unknown) => {
      await mod.runProcessLeads(payload as { jobId: string; userId: string })
    }
  },
}

export interface DrainResult {
  reclaimed: number
  processed: number
  results: Array<{
    id: string
    status: 'done' | 'failed'
    terminal?: boolean
    error?: string
    reasonCode?: string
  }>
}

/**
 * Batch size adaptativo (task 15 / regra 9.1 do fonte): o alarme de fila
 * parada grava slowdownFactor em outreach.throttle_state; o drain respeita.
 */
async function resolveBatchSize(): Promise<number> {
  try {
    const { getConfig } = await import('@/lib/services/system-config')
    const state = await getConfig<{ drainBatchSize?: number; slowdownFactor?: number; slowdownUntil?: string | null }>(
      'outreach.throttle_state',
    )
    const base = Number(state.drainBatchSize ?? 10)
    const until = state.slowdownUntil ? Date.parse(state.slowdownUntil) : 0
    const factor = until > Date.now() ? Math.max(1, Number(state.slowdownFactor ?? 1)) : 1
    return Math.max(1, Math.floor(base / factor))
  } catch {
    return 10
  }
}

export async function runDrainLocalQueue(): Promise<DrainResult> {
  const reclaimed = await reclaimExpired().catch(() => 0)
  const limit = await resolveBatchSize()
  const batch = await leaseBatch({ limit, leaseMs: 120_000 })

  const results: DrainResult['results'] = []

  for (const job of batch) {
    try {
      const loader = HANDLERS[job.kind]
      if (!loader) throw new Error(`no handler registered for kind=${job.kind}`)
      const handler = await loader()
      await handler(job.payload)
      await ackDone(job.id)
      results.push({ id: job.id, status: 'done' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const reasonCode = classifyError(err)
      const permanent = isPermanentError(err)
      const { terminal } = await ackFailed(job.id, msg, { reasonCode, permanent })
      if (terminal) {
        captureException(err, { layer: 'local-queue', kind: job.kind, jobId: job.id, reasonCode })
      }
      results.push({ id: job.id, status: 'failed', terminal, error: msg, reasonCode })
    }
  }

  // Retencao oportunista (task 03) — throttled internamente a 1x/hora.
  await sweepQueueRetention().catch(() => undefined)

  return { reclaimed, processed: batch.length, results }
}
