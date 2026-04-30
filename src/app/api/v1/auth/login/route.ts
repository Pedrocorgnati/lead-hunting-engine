import { NextRequest, NextResponse } from 'next/server'
import { SignInSchema } from '@/schemas/auth.schema'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { errorResponse, AUTH_002, AUTH_003 } from '@/constants/errors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'

// TASK-AUDIT-2 / G2-001 — defesa em profundidade contra brute force.
// Bucket fino (par IP+email): protege a vitima identificada — 5 tentativas/60s.
// Bucket grosseiro (so IP):   protege contra credential stuffing horizontal
//                             do mesmo IP variando emails — 20/60s.
// `x-forwarded-for` e confiavel pois o app roda atras do edge da Vercel,
// que sobrescreve o header. Em qualquer outro deploy, revalidar trust boundary.
const LOGIN_PAIR_LIMIT = 5
const LOGIN_IP_LIMIT = 20
const LOGIN_WINDOW_SECONDS = 60

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)

  try {
    const body = await request.json()
    const validated = SignInSchema.parse(body)
    // Normalizacao canonica para rate-limit + audit trail consistente.
    const emailKey = validated.email.toLowerCase().trim()

    // Bucket fino (IP + email) — bloqueio direcionado.
    const rlPair = checkRateLimit(
      `auth-login:pair:${ipAddress}:${emailKey}`,
      LOGIN_PAIR_LIMIT,
      LOGIN_WINDOW_SECONDS,
    )
    // Bucket grosseiro (so IP) — bloqueio horizontal contra credential stuffing.
    const rlIp = checkRateLimit(
      `auth-login:ip:${ipAddress}`,
      LOGIN_IP_LIMIT,
      LOGIN_WINDOW_SECONDS,
    )

    if (!rlPair.success || !rlIp.success) {
      const retryAfter = Math.max(rlPair.retryAfter, rlIp.retryAfter)
      // Audit: rate-limited tambem precisa de trail.
      prisma.loginAttempt
        .create({ data: { email: emailKey, ipAddress, success: false } })
        .catch(() => {})
      return NextResponse.json(
        errorResponse(AUTH_003, `Tente novamente em ${retryAfter} segundos.`),
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    })

    // ST003 — TASK-AUDIT-1: registrar tentativa (brute-force audit trail)
    prisma.loginAttempt.create({
      data: { email: emailKey, ipAddress, success: !error },
    }).catch(() => {/* fire-and-forget — não bloqueia o login */})

    if (error) {
      // RESOLVED: mapeamento de 429 Supabase → AUTH_003 + Retry-After (SEC-005)
      if (error.status === 429) {
        const retryAfter = parseInt(error.message.match(/\d+/)?.[0] ?? '60', 10)
        return NextResponse.json(
          errorResponse(AUTH_003, `Tente novamente em ${retryAfter} segundos.`),
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        )
      }
      return NextResponse.json(errorResponse(AUTH_002), { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { id: data.user.id },
    })

    return NextResponse.json({ user: profile })
  } catch (error) {
    return handleApiError(error)
  }
}
