/**
 * TASK-15 intake-review (CL-173): drenagem da fila local.
 * Cron intervalo 1-2min (Vercel cron ou cron externo apontando aqui).
 *
 * Seguranca: requer header `x-cron-secret` === `CRON_SECRET` env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runDrainLocalQueue } from '@/lib/workers/drain-local-queue'
import { isCronPaused, recordCronRun } from '@/lib/cron/registry'

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
  if (await isCronPaused('drain-local-queue')) {
    return NextResponse.json({ skipped: true, reason: 'paused' })
  }
  const result = await runDrainLocalQueue()
  void recordCronRun('drain-local-queue', 'ok')
  return NextResponse.json(result)
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
