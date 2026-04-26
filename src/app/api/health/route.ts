import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import packageJson from '../../../../package.json'

/**
 * GET /api/health
 *   ?service=supabase -> checa apenas conectividade com Supabase auth (TASK-18/ST002)
 *   (default)         -> checa DB
 */
export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get('service')

  if (service === 'supabase') {
    // Healthcheck do Supabase: ping no /auth/v1/health.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) {
      return NextResponse.json({ status: 'error', service: 'supabase', reason: 'missing_url' }, { status: 503 })
    }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3_000)
      const res = await fetch(`${url}/auth/v1/health`, { cache: 'no-store', signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) {
        return NextResponse.json({ status: 'error', service: 'supabase', http: res.status }, { status: 503 })
      }
      return NextResponse.json({ status: 'ok', service: 'supabase' })
    } catch (e) {
      return NextResponse.json(
        { status: 'error', service: 'supabase', reason: e instanceof Error ? e.message : 'unknown' },
        { status: 503 },
      )
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
    })
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'disconnected', timestamp: new Date().toISOString(), version: packageJson.version },
      { status: 503 }
    )
  }
}
