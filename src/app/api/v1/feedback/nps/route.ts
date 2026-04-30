import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { getClientIp } from '@/lib/rate-limiter'
import { npsService } from '@/services/nps.service'
import { NpsSubmitSchema } from '@/lib/schemas/nps'

/**
 * GET /api/v1/feedback/nps
 *   Retorna a elegibilidade do usuario para responder NPS (M14-G-006).
 *
 * POST /api/v1/feedback/nps
 *   Submete uma resposta NPS. Rate-limit aplicado via cooldown configuravel
 *   em SystemConfig.nps.response_cooldown_days (M14-G-021).
 */

export async function GET() {
  try {
    const user = await requireAuth()
    const eligibility = await npsService.getEligibility(user.id)
    return NextResponse.json(eligibility)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    const body = (await request.json().catch(() => null)) as unknown
    const parsed = NpsSubmitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: { code: 'INVALID_PAYLOAD', message: 'Payload invalido', issues: parsed.error.issues },
        },
        { status: 400 }
      )
    }

    const userAgent = request.headers.get('user-agent') ?? undefined
    const ipAddress = getClientIp(request)

    const response = await npsService.submit(user.id, parsed.data, {
      userAgent,
      ipAddress,
    })

    return NextResponse.json(
      {
        id: response.id,
        score: response.score,
        submittedAt: response.submittedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
