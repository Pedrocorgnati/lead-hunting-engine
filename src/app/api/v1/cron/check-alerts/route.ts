import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/observability/sentry'
import { checkLlmMonthlyThreshold } from '@/lib/alerts/llm-threshold'
import { checkStuckJobs } from '@/lib/alerts/stuck-jobs'
import { checkApiDailyThreshold } from '@/lib/alerts/api-daily'
import { isCronPaused, recordCronRun } from '@/lib/cron/registry'

/**
 * GET /api/v1/cron/check-alerts
 *
 * Cron Vercel a cada 5 minutos — roda os checks de alerta:
 *   - LLM mensal > threshold
 *   - API chamadas/dia > threshold
 *   - Jobs PENDING > stuck_minutes
 *
 * Dedup diario via `SentAlert` (UNIQUE rule+dayKey).
 *
 * Origem: TASK-13 intake-review / ST003.
 */
function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.CRON_SECRET_KEY
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader === `Bearer ${secret}`) return true
  const legacyToken = request.headers.get('x-cron-token')
  if (legacyToken && legacyToken === secret) return true
  return false
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (await isCronPaused('check-alerts')) {
    return NextResponse.json({ skipped: true, reason: 'paused' })
  }

  const results: Record<string, unknown> = {}
  const runners: Array<{ name: string; fn: () => Promise<unknown> }> = [
    { name: 'llmMonthly', fn: checkLlmMonthlyThreshold },
    { name: 'apiDaily', fn: checkApiDailyThreshold },
    { name: 'stuckJobs', fn: checkStuckJobs },
  ]

  let hadError = false
  for (const { name, fn } of runners) {
    try {
      results[name] = await fn()
    } catch (err) {
      hadError = true
      captureException(err, { job: 'check-alerts', check: name })
      results[name] = { error: (err as Error).message }
    }
  }

  void recordCronRun('check-alerts', hadError ? 'error' : 'ok')
  return NextResponse.json({ ok: true, results })
}
