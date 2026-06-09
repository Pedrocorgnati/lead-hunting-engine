import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { verifyChallenge } from '@/lib/security/reauth-challenge-store'

const Body = z.object({
  phrase: z.string().trim().min(3).max(160),
  scope: z.string().trim().max(120).optional(),
  reauthId: z.string().trim().min(1).max(200).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = crypto.randomUUID()

  try {
    const user = await requireAuth()
    const { id } = await context.params
    const json = await request.json().catch(() => ({}))
    const body = Body.parse(json)
    correlationId = body.correlationId ?? correlationId

    const result = verifyChallenge({
      challengeId: id,
      userId: user.id,
      phrase: body.phrase,
      scope: body.scope,
      reauthId: body.reauthId,
    })

    if (!result.ok) {
      const status = result.reason === 'NOT_FOUND' ? 404 : result.reason === 'PHRASE_MISMATCH' ? 422 : 401
      return NextResponse.json(
        {
          error: {
            code: result.reason === 'PHRASE_MISMATCH' ? 'VAL_002' : 'AUTH_006',
            message: 'Falha na confirmacao do challenge.',
            reason: result.reason,
            correlationId,
          },
        },
        { status },
      )
    }

    return NextResponse.json({
      data: {
        ok: true,
        challengeId: id,
        verifiedAt: result.verifiedAt,
        correlationId,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
