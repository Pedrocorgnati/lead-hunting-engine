import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { issueChallenge, validateReauthSession } from '@/lib/security/reauth-challenge-store'

const Body = z.object({
  phrase: z.string().trim().min(3).max(160),
  scope: z.string().trim().max(120).optional(),
  reauthId: z.string().trim().min(1).max(200).optional(),
  ttlSeconds: z.number().int().min(30).max(3600).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

export async function POST(request: NextRequest) {
  let correlationId = crypto.randomUUID()

  try {
    const user = await requireAuth()
    const json = await request.json().catch(() => ({}))
    const body = Body.parse(json)
    correlationId = body.correlationId ?? correlationId

    if (body.reauthId) {
      const reauth = validateReauthSession({
        reauthId: body.reauthId,
        userId: user.id,
        scope: body.scope,
      })

      if (!reauth.ok) {
        return NextResponse.json(
          {
            error: {
              code: 'AUTH_006',
              message: 'Reautenticacao recente obrigatoria para criar challenge.',
              reason: reauth.reason,
              correlationId,
            },
          },
          { status: 401 },
        )
      }
    }

    const created = issueChallenge({
      userId: user.id,
      phrase: body.phrase,
      scope: body.scope,
      reauthId: body.reauthId,
      ttlSeconds: body.ttlSeconds,
    })

    return NextResponse.json({
      data: {
        ok: true,
        ...created,
        correlationId,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
