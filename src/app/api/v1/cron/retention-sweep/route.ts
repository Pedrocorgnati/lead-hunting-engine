/**
 * TASK-26 intake-review: cron handler do retention sweeper das novas entidades PII.
 * Separado de /api/v1/cron/retention-cleanup (que cobre deletion requests LGPD Art.18).
 * Autoriza com CRON_SECRET Bearer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runRetentionSweep } from '@/lib/workers/retention-sweeper'
import { AuditService } from '@/lib/services/audit-service'
import { captureException } from '@/lib/observability/sentry'

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.CRON_SECRET_KEY
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader === `Bearer ${secret}`) return true
  const legacyToken = request.headers.get('x-cron-token')
  if (legacyToken && legacyToken === secret) return true
  return false
}

async function runAndAudit() {
  try {
    const results = await runRetentionSweep()
    const total = results.reduce((s, r) => s + Math.max(0, r.count), 0)
    await AuditService.log({
      action: 'audit_log.exported', // reutiliza enum; metadata distingue
      resource: 'retention_sweep',
      metadata: {
        sweep: 'retention_pii',
        total,
        ...Object.fromEntries(results.map((r) => [r.entity, r.count])),
      },
    })
    return NextResponse.json({ ok: true, total, results })
  } catch (error) {
    captureException(error, { job: 'retention-sweep' })
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runAndAudit()
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runAndAudit()
}
