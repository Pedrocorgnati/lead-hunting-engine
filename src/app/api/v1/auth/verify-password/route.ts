/**
 * TASK-18/ST003 (CL-043): re-autenticacao para operacoes sensiveis (delete conta).
 * POST { currentPassword } -> { ok: true } ou 401 ao falhar.
 * Rate-limit: 3/min por usuario.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { limits } from '@/lib/rate-limiter'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  currentPassword: z.string().min(6).max(200),
})

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    // R-13: dois rate-limits independentes — por-user (3/min) E por-IP (10/min).
    limits.authVerify(user.id)
    limits.authVerifyByIp(getIp(request))

    const json = await request.json().catch(() => ({}))
    const { currentPassword } = Body.parse(json)

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (error) {
      return NextResponse.json(
        { error: { code: 'AUTH_002', message: 'Senha atual inválida.' } },
        { status: 401 },
      )
    }
    return NextResponse.json({ data: { ok: true } })
  } catch (error) {
    return handleApiError(error)
  }
}
