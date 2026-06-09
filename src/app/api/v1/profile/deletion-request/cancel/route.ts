import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { errorResponse, USER_080, USER_081, USER_082 } from '@/constants/errors'
import { checkRateLimit } from '@/lib/utils/rate-limiter'
import { profileService, ProfileError } from '@/services/profile.service'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    const { allowed, retryAfterMs } = checkRateLimit(`deletion:${user.id}`, 3, 60_000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas solicitações. Tente novamente em breve.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        },
      )
    }

    const ipAddress = req.headers.get('x-forwarded-for') ?? undefined
    await profileService.cancelDeletion(user.id, ipAddress)
    return NextResponse.json({ message: 'Solicitação de exclusão cancelada. Sua conta permanece ativa.' })
  } catch (error) {
    if (error instanceof ProfileError) {
      if (error.type === 'NOT_REQUESTED') {
        return NextResponse.json(errorResponse(USER_081), { status: 404 })
      }
      if (error.type === 'DEADLINE_PASSED') {
        return NextResponse.json(errorResponse(USER_082), { status: 410 })
      }
      if (error.type === 'NOT_FOUND') {
        return NextResponse.json(errorResponse(USER_080), { status: 404 })
      }
    }
    return handleApiError(error)
  }
}
