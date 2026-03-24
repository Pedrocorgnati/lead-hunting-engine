import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { profileService, ProfileError } from '@/services/profile.service'
import { errorResponse, USER_050, USER_080 } from '@/constants/errors'
import { checkRateLimit } from '@/lib/utils/rate-limiter'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    // Rate limit: max 3 deletion requests per minute per user
    const { allowed, retryAfterMs } = checkRateLimit(`deletion:${user.id}`, 3, 60_000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas solicitações. Tente novamente em breve.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      )
    }

    const ipAddress = req.headers.get('x-forwarded-for') ?? undefined
    await profileService.requestDeletion(user.id, ipAddress)
    return NextResponse.json({ message: 'Solicitação de exclusão registrada. Processamento em até 15 dias.' })
  } catch (error) {
    if (error instanceof ProfileError) {
      if (error.type === 'DUPLICATE_DELETION') {
        return NextResponse.json(errorResponse(USER_050), { status: 409 })
      }
      if (error.type === 'NOT_FOUND') {
        return NextResponse.json(errorResponse(USER_080), { status: 404 })
      }
    }
    return handleApiError(error)
  }
}
