/**
 * outreach-engine (brainstorm 06-10): scheduler do ciclo de outreach.
 * Cron a cada 5min — re-enfileira dispatches devidos, dispara reply-sync
 * IMAP e monitora fila parada. Mesmo contrato de auth do drain-local-queue.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runOutreachScheduler } from '@/lib/workers/outreach-scheduler'
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

async function run() {
  if (await isCronPaused('outreach-scheduler')) {
    return NextResponse.json({ skipped: true, reason: 'paused' })
  }
  const result = await runOutreachScheduler()
  void recordCronRun('outreach-scheduler', 'ok')
  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}
