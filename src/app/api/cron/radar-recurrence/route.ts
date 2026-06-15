/**
 * outreach-engine (brainstorm 06-10, task 25 — F-01): scheduler recorrente de
 * radar. Cron diario — re-coleta presets cuja ultima execucao excede a
 * cadencia (SystemConfig radar.recurrence). Mesmo contrato de auth do
 * drain-local-queue.
 */
import { NextRequest, NextResponse } from 'next/server'
import { radarService } from '@/lib/services/radar-service'
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
  if (await isCronPaused('radar-recurrence')) {
    return NextResponse.json({ skipped: true, reason: 'paused' })
  }
  const result = await radarService.runRecurringRecollection()
  void recordCronRun('radar-recurrence', 'ok')
  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run()
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run()
}
