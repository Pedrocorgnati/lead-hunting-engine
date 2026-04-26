import { NextRequest, NextResponse } from 'next/server'
import { runRetentionCleanup } from '@/lib/jobs/retention-cleanup'
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

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runRetentionCleanup()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    captureException(error, { job: 'retention-cleanup' })
    console.error('[retention-cleanup] erro:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
