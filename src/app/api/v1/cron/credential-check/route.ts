import { NextRequest, NextResponse } from 'next/server'
import { runCredentialExpiringJob } from '@/lib/jobs/api-credential-expiring'

const CRON_TOKEN = process.env.CRON_SECRET_KEY

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-cron-token')
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCredentialExpiringJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[credential-check] erro:', error)
    return NextResponse.json({ error: 'Credential check failed' }, { status: 500 })
  }
}
