import { NextRequest, NextResponse } from 'next/server'
import { UpdatePasswordSchema } from '@/schemas/auth.schema'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'

// TASK-0/ST002: Rate limit — 3 requests/min por IP (update-password)
const RATE_LIMIT = 3

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (TASK-0/ST002)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`auth-update-password:${ip}`, RATE_LIMIT)
    if (!rl.success) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' } },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter) },
        }
      )
    }

    await requireAuth()
    const body = await request.json()
    const validated = UpdatePasswordSchema.parse(body)

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({
      password: validated.password,
    })

    if (error) {
      return NextResponse.json(
        { error: { code: 'AUTH_005', message: error.message } },
        { status: 400 }
      )
    }

    return NextResponse.json({ message: 'Senha atualizada com sucesso.' })
  } catch (error) {
    return handleApiError(error)
  }
}
