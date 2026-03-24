import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { inviteService } from '@/services/invite.service'
import { errorResponse, INVITE_050, INVITE_051, INVITE_080 } from '@/constants/errors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import { InviteStatus } from '@/lib/constants/enums'

// TASK-0/ST002: Rate limit — 10 requests/min por IP (GET de token público)
const RATE_LIMIT = 10

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limiting (TASK-0/ST002)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`invites-get:${ip}`, RATE_LIMIT)
    if (!rl.success) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' } },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter) },
        }
      )
    }

    const { token } = await params
    const invite = await inviteService.findByToken(token)

    if (!invite) {
      return NextResponse.json(errorResponse(INVITE_080), { status: 404 })
    }

    // COMP-004: validar TTL e status server-side — não confiar apenas em status
    if (invite.status === InviteStatus.ACCEPTED) {
      return NextResponse.json(errorResponse(INVITE_051), { status: 410 })
    }
    if (invite.status !== InviteStatus.PENDING || invite.expiresAt < new Date()) {
      return NextResponse.json(errorResponse(INVITE_050), { status: 410 })
    }

    return successResponse({ email: invite.email, role: invite.role })
  } catch (error) {
    return handleApiError(error)
  }
}
