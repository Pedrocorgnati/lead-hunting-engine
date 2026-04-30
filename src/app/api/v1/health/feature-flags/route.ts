import { NextResponse } from 'next/server'
import { probeProviderHealth } from '@/lib/feature-flags/provider'

/**
 * GET /api/v1/health/feature-flags
 *
 * Cobre: TASK-1/ST005.
 *
 * Healthcheck do provider de feature flags. Em provider local, valida a
 * presenca da flag canonica `system.healthcheck.echo` e mede latencia.
 *
 * Resp 200 { status: "ok", provider, latency_ms }
 * Resp 503 { status: "down", provider, error, latency_ms }
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const probe = await probeProviderHealth()
  if (probe.status === 'ok') {
    return NextResponse.json(
      { status: 'ok', provider: probe.provider, latency_ms: probe.latencyMs },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(
    {
      status: 'down',
      provider: probe.provider,
      latency_ms: probe.latencyMs,
      error: probe.error ?? 'unknown',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
