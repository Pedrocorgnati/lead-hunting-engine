import { NextRequest, NextResponse } from 'next/server'
import { runLgpdRetentionCleanup } from '@/lib/jobs/lgpd-retention-cleanup'
import { captureException } from '@/lib/observability/sentry'

// Prisma + Supabase Admin precisam Node runtime (nao edge)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const result = await runLgpdRetentionCleanup()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    captureException(error, { job: 'lgpd-retention-cleanup' })
    console.error('[lgpd-cleanup] erro:', error)
    return NextResponse.json({ error: 'LGPD cleanup failed' }, { status: 500 })
  }
}
