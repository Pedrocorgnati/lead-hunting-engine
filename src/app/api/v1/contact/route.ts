import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { contactSchema } from '@/lib/schemas/landing'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { errorResponse, LGPD_CONSENT_REQUIRED } from '@/constants/errors'
import { notifyAdmins } from '@/lib/notifications/admin-broadcast'

const MIN_FORM_FILL_MS = 2000

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

/**
 * POST /api/v1/contact — TASK-2/ST004 (CL-307, CL-311, CL-317, CL-326, CL-403)
 * Cria uma ContactMessage status=NEW e despacha CONTACT_MESSAGE_RECEIVED
 * (in-app + canais habilitados) para todos os admins ativos. Fire-and-forget —
 * notificacao nao bloqueia response (R-02 intake-review).
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
    const parsed = contactSchema.safeParse(body)
    if (!parsed.success) {
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

    if (data._gotcha && data._gotcha.trim().length > 0) {
      return successResponse({ message: 'Mensagem recebida.', fake: true })
    }

    const formStartedAt = Number(request.headers.get('x-form-started-at') ?? 0)
    if (formStartedAt > 0 && Date.now() - formStartedAt < MIN_FORM_FILL_MS) {
      return successResponse({ message: 'Mensagem recebida.', fake: true })
    }

    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null

    const created = await prisma.contactMessage.create({
      data: {
        email: data.email,
        name: data.name,
        subject: data.subject,
        message: data.message,
        ip,
        userAgent,
        consentLgpd: true,
      },
      select: { id: true },
    })

    // R-02 (CL-311): dispatch admin fire-and-forget — NUNCA bloqueia a resposta.
    void notifyAdmins({
      event: 'CONTACT_MESSAGE_RECEIVED',
      params: { name: data.name, subject: data.subject },
      data: { contactMessageId: created.id },
    })

    return successResponse({ message: 'Mensagem recebida. Entraremos em contato em breve.' })
  } catch (err) {
    return handleApiError(err)
  }
}
