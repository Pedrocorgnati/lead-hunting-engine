import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { inviteService, InviteError } from '@/services/invite.service'
import { ActivateAccountSchema } from '@/schemas/invite.schema'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import { errorResponse, INVITE_050, INVITE_051, INVITE_080 } from '@/constants/errors'

// TASK-0/ST002: Rate limit — 5 requests/min por IP (ativação de conta)
const RATE_LIMIT = 5

// Mapeamento InviteError.code → error constant
const INVITE_ERROR_MAP: Record<string, { code: string; httpStatus: number; userMessage: string; technicalMessage: string }> = {
  INVITE_050: INVITE_050,
  INVITE_051: INVITE_051,
  INVITE_080: INVITE_080,
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limiting (TASK-0/ST002)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`invites-activate:${ip}`, RATE_LIMIT)
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
    const body = await request.json()
    const validated = ActivateAccountSchema.parse(body)

    const result = await inviteService.activate(token, validated)
    return NextResponse.json({ user: result }, { status: 201 })
  } catch (error) {
    if (error instanceof InviteError) {
      if (error.code === 'AUTH_004') {
        return NextResponse.json(
          { error: { code: 'AUTH_004', message: 'Erro ao criar conta. Tente novamente.' } },
          { status: 500 }
        )
      }
      const mapped = INVITE_ERROR_MAP[error.code]
      if (mapped) {
        return NextResponse.json(errorResponse(mapped), { status: mapped.httpStatus })
      }
    }
    return handleApiError(error)
  }
}
