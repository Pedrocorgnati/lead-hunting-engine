import { NextRequest, NextResponse } from 'next/server'
import { SignInSchema } from '@/schemas/auth.schema'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { errorResponse, AUTH_002, AUTH_003, AUTH_LOCKED_OUT } from '@/constants/errors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import { getLockState, recordFailure, recordSuccess } from '@/lib/auth/lockout-policy'
import { AuditService } from '@/lib/services/audit-service'

// G2-001 — defesa em profundidade contra brute force.
// Bucket fino (par IP+email): protege a vitima identificada — 5 tentativas/60s.
// Bucket grosseiro (so IP):   protege contra credential stuffing horizontal — 20/60s.
const LOGIN_PAIR_LIMIT = 5
const LOGIN_IP_LIMIT = 20
const LOGIN_WINDOW_SECONDS = 60

function extractRequestContext(request: NextRequest): { ip: string; userAgent: string } {
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  }
}

export async function POST(request: NextRequest) {
  const { ip: ipAddress, userAgent } = extractRequestContext(request)

  try {
    const body = await request.json()
    const validated = SignInSchema.parse(body)
    const emailKey = validated.email.toLowerCase().trim()
    const lockoutKey = `lockout:email:${emailKey}`

    // 1. Gate: lockout exponencial por usuario (CL-038)
    const lockState = getLockState(lockoutKey)
    if (lockState.lockedUntil !== null && lockState.lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockState.lockedUntil - Date.now()) / 1000)
      AuditService.log({
        action: 'LOGIN_FAILED',
        resource: 'auth',
        metadata: { emailAttempted: emailKey, reason: 'LOCKED_OUT', ip: ipAddress },
        ipAddress,
        userAgent,
      }).catch(() => {})
      return NextResponse.json(
        errorResponse(AUTH_LOCKED_OUT, `Tente novamente em ${retryAfterSeconds} segundos.`),
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      )
    }

    // 2. Gate: rate limit por par (IP + email) e por IP
    const rlPair = checkRateLimit(
      `auth-login:pair:${ipAddress}:${emailKey}`,
      LOGIN_PAIR_LIMIT,
      LOGIN_WINDOW_SECONDS,
    )
    const rlIp = checkRateLimit(
      `auth-login:ip:${ipAddress}`,
      LOGIN_IP_LIMIT,
      LOGIN_WINDOW_SECONDS,
    )

    if (!rlPair.success || !rlIp.success) {
      const retryAfter = Math.max(rlPair.retryAfter, rlIp.retryAfter)
      prisma.loginAttempt
        .create({ data: { email: emailKey, ipAddress, success: false } })
        .catch(() => {})
      return NextResponse.json(
        errorResponse(AUTH_003, `Tente novamente em ${retryAfter} segundos.`),
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    // 3. Autenticar via Supabase
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    })

    // Fire-and-forget: audit brute-force trail (LoginAttempt legado)
    prisma.loginAttempt.create({
      data: { email: emailKey, ipAddress, success: !error },
    }).catch(() => {})

    if (error) {
      recordFailure(lockoutKey)
      AuditService.log({
        action: 'LOGIN_FAILED',
        resource: 'auth',
        metadata: {
          emailAttempted: emailKey,
          reason: error.status === 429 ? 'SUPABASE_RATE_LIMITED' : 'INVALID_CREDENTIALS',
          ip: ipAddress,
        },
        ipAddress,
        userAgent,
      }).catch(() => {})

      if (error.status === 429) {
        const retryAfter = parseInt(error.message.match(/\d+/)?.[0] ?? '60', 10)
        return NextResponse.json(
          errorResponse(AUTH_003, `Tente novamente em ${retryAfter} segundos.`),
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        )
      }
      // Resposta generica — nao vaza existencia da conta (CL-038)
      return NextResponse.json(errorResponse(AUTH_002), { status: 401 })
    }

    // 4. Sucesso: resetar lockout + audit LOGIN_SUCCESS
    recordSuccess(lockoutKey)
    const profile = await prisma.userProfile.findUnique({
      where: { id: data.user.id },
    })
    AuditService.log({
      action: 'LOGIN_SUCCESS',
      resource: 'auth',
      userId: data.user.id,
      metadata: { emailAttempted: emailKey, ip: ipAddress },
      ipAddress,
      userAgent,
    }).catch(() => {})

    return NextResponse.json({ user: profile })
  } catch (error) {
    return handleApiError(error)
  }
}
