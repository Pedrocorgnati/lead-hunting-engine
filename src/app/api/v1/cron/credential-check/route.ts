import { NextRequest, NextResponse } from 'next/server'
import { runCredentialExpiringJob } from '@/lib/jobs/api-credential-expiring'
import { isCronPaused, recordCronRun } from '@/lib/cron/registry'

const CRON_TOKEN = process.env.CRON_SECRET_KEY

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-cron-token')
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (await isCronPaused('credential-check')) {
    return NextResponse.json({ skipped: true, reason: 'paused' })
  }

  try {
    const result = await runCredentialExpiringJob()
    void recordCronRun('credential-check', 'ok')
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    void recordCronRun('credential-check', 'error')
    console.error('[credential-check] erro:', error)
    return NextResponse.json({ error: 'Credential check failed' }, { status: 500 })
  }
}
