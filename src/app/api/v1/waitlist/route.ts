import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { waitlistSchema } from '@/lib/schemas/landing'
import { assertRateLimit, getClientIp, RateLimitError } from '@/lib/rate-limiter'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { errorResponse, LGPD_CONSENT_REQUIRED } from '@/constants/errors'

const MIN_FORM_FILL_MS = 2000

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return true // GET/server-side; bloqueio so vale quando ha origin
  try {
    const originUrl = new URL(origin)
    return originUrl.host === host
  } catch {
    return false
  }
}

/**
 * POST /api/v1/waitlist — TASK-2/ST003 (CL-307, CL-310, CL-315, CL-317, CL-326, CL-403)
 *
 * Fluxo:
 *  1. Rate-limit bucket landing-forms (5 req/min/IP)
 *  2. Valida origin (evita CSRF)
 *  3. Parse Zod
 *  4. Honeypot (_gotcha preenchido) + time-to-fill (<2s) => 200 fake sem persist
 *  5. Upsert por email (idempotente)
 *  6. Zero Silencio: retorna 200 com dados sanitizados
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  try {
    assertRateLimit(`landing-forms:${ip}`, 5)

    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: { code: 'AUTH_004', message: 'Origem nao autorizada.' } },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    const parsed = waitlistSchema.safeParse(body)
    if (!parsed.success) {
      // Nao vazamos detalhe: se consentLgpd falhou, retorna 422 com codigo especifico
      const issues = parsed.error.issues
      const hasConsentIssue = issues.some((i) => i.path?.[0] === 'consentLgpd')
      if (hasConsentIssue) {
        return NextResponse.json(errorResponse(LGPD_CONSENT_REQUIRED), { status: 422 })
      }
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados invalidos.',
            details: issues.map((i) => `${i.path?.join('.') ?? ''}: ${i.message}`).join('; '),
          },
        },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Honeypot preenchido (CL-326): resposta 200 fake
    if (data._gotcha && data._gotcha.trim().length > 0) {
      return successResponse({ message: 'Inscricao recebida.', fake: true })
    }

    // Time-to-fill (anti-bot reforcado)
    const formStartedAt = Number(request.headers.get('x-form-started-at') ?? 0)
    if (formStartedAt > 0 && Date.now() - formStartedAt < MIN_FORM_FILL_MS) {
      return successResponse({ message: 'Inscricao recebida.', fake: true })
    }

    // Persist (upsert — idempotente)
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null

    await prisma.waitlistEntry.upsert({
      where: { email: data.email },
      create: {
        email: data.email,
        name: data.name ?? null,
        businessType: data.businessType ?? null,
        ip,
        userAgent,
        consentLgpd: true,
      },
      update: {
        name: data.name ?? undefined,
        businessType: data.businessType ?? undefined,
        // atualiza ip/UA apenas para nao perder ultimo contato
        ip,
        userAgent,
      },
    })

    return successResponse({ message: 'Inscricao recebida.' })
  } catch (err) {
    if (err instanceof RateLimitError) {
      return handleApiError(err)
    }
    return handleApiError(err)
  }
}
