/**
 * TASK-15 intake-review (CL-173): drenagem da fila local.
 * Cron intervalo 1-2min (Vercel cron ou cron externo apontando aqui).
 *
 * Seguranca: requer header `x-cron-secret` === `CRON_SECRET` env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { leaseBatch, ackDone, ackFailed, reclaimExpired } from '@/lib/workers/local-queue'
import { captureException } from '@/lib/observability/sentry'

// Handlers por `kind`. Novos kinds devem se registrar aqui.
type Handler = (payload: unknown) => Promise<void>
const HANDLERS: Record<string, () => Promise<Handler>> = {
  export: async () => {
    const mod = await import('@/lib/workers/export-worker')
    return async (payload: unknown) => {
      const { exportId } = payload as { exportId: string }
      await mod.runExportWorker(exportId)
    }
  },
}

export const dynamic = 'force-dynamic'

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.CRON_SECRET_KEY
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader === `Bearer ${secret}`) return true
  const legacyToken = request.headers.get('x-cron-token') ?? request.headers.get('x-cron-secret')
  if (legacyToken && legacyToken === secret) return true
  return false
}

async function runDrain() {

  const reclaimed = await reclaimExpired().catch(() => 0)
  const batch = await leaseBatch({ limit: 10, leaseMs: 120_000 })

  const results: Array<{ id: string; status: 'done' | 'failed'; terminal?: boolean; error?: string }> = []

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

  return NextResponse.json({
    reclaimed,
    processed: batch.length,
    results,
  })
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDrain()
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDrain()
}
