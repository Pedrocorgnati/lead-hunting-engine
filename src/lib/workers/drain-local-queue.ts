import { leaseBatch, ackDone, ackFailed, reclaimExpired } from '@/lib/workers/local-queue'
import { captureException } from '@/lib/observability/sentry'

/**
 * Core da drenagem da fila local (CL-173), compartilhado entre o cron route
 * (/api/cron/drain-local-queue) e o trigger manual admin (AD29).
 *
 * Handlers por `kind`. Novos kinds devem se registrar aqui.
 */
type Handler = (payload: unknown) => Promise<void>
const HANDLERS: Record<string, () => Promise<Handler>> = {
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
  results: Array<{ id: string; status: 'done' | 'failed'; terminal?: boolean; error?: string }>
}

export async function runDrainLocalQueue(): Promise<DrainResult> {
  const reclaimed = await reclaimExpired().catch(() => 0)
  const batch = await leaseBatch({ limit: 10, leaseMs: 120_000 })

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
      const { terminal } = await ackFailed(job.id, msg)
      if (terminal) {
        captureException(err, { layer: 'local-queue', kind: job.kind, jobId: job.id })
      }
      results.push({ id: job.id, status: 'failed', terminal, error: msg })
    }
  }

  return { reclaimed, processed: batch.length, results }
}
