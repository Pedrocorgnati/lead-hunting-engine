import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ErrorReportSchema = z
  .object({
    correlationId: z.string().trim().min(8).max(120),
    boundary: z.string().trim().min(1).max(120),
    pathname: z.string().trim().max(500).optional(),
    userAgent: z.string().trim().max(500).optional(),
    digest: z.string().trim().max(120).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .strict()

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    assertRateLimit(`errors-report:${ip}`, 20)

    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: { code: 'AUTH_004', message: 'Origem nao autorizada.' } },
        { status: 403 },
      )
    }

    const body = ErrorReportSchema.parse(await request.json().catch(() => ({})))

    console.error('[Client Error Report]', {
      correlationId: body.correlationId,
      boundary: body.boundary,
      pathname: body.pathname ?? null,
      digest: body.digest ?? null,
      occurredAt: body.occurredAt ?? null,
      ip,
      userAgent: body.userAgent ?? null,
    })

    return successResponse({
      reported: true,
      correlationId: body.correlationId,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
