import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { consentSchema } from '@/lib/schemas/landing'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * POST /api/v1/consent — TASK-3/ST003 (CL-312)
 * Registra LandingConsent ancorando IP hash (LGPD: dado de identificacao
 * pseudoanonimizado) + user agent + versao + categorias.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  try {
    assertRateLimit(`landing-forms:${ip}`, 5)

    const body = await request.json().catch(() => null)
    const parsed = consentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Consent invalido.',
            details: parsed.error.issues
              .map((i) => `${i.path?.join('.') ?? ''}: ${i.message}`)
              .join('; '),
          },
        },
        { status: 400 },
      )
    }

    const ipHash = createHash('sha256').update(ip).digest('hex')
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? ''

    const consent = await prisma.landingConsent.create({
      data: {
        ipHash,
        userAgent,
        version: parsed.data.version,
        categories: parsed.data.categories,
      },
      select: { id: true, acceptedAt: true, version: true, categories: true },
    })

    return successResponse(consent)
  } catch (err) {
    return handleApiError(err)
  }
}
