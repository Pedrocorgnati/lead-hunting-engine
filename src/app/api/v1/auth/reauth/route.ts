import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { limits } from '@/lib/rate-limiter'
import { createClient } from '@/lib/supabase/server'
import { issueReauthSession } from '@/lib/security/reauth-challenge-store'

const Body = z.object({
  currentPassword: z.string().min(6).max(200),
  scope: z.string().trim().max(120).optional(),
  ttlSeconds: z.number().int().min(30).max(3600).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(request: NextRequest) {
  let correlationId = crypto.randomUUID()

  try {
    const user = await requireAuth()
    limits.authVerify(user.id)
    limits.authVerifyByIp(getIp(request))

    const json = await request.json().catch(() => ({}))
    const body = Body.parse(json)
    correlationId = body.correlationId ?? correlationId

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: body.currentPassword,
    })

    if (error) {
      return NextResponse.json(
        { error: { code: 'AUTH_002', message: 'Senha atual inválida.', correlationId } },
        { status: 401 },
      )
    }

    const issued = issueReauthSession({
      userId: user.id,
      scope: body.scope,
      ttlSeconds: body.ttlSeconds,
    })

    return NextResponse.json({
      data: {
        ok: true,
        ...issued,
        correlationId,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
