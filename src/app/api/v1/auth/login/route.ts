import { NextRequest, NextResponse } from 'next/server'
import { SignInSchema } from '@/schemas/auth.schema'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { errorResponse, AUTH_002, AUTH_003 } from '@/constants/errors'

export async function POST(request: NextRequest) {
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'

  try {
    const body = await request.json()
    const validated = SignInSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    })

    // ST003 — TASK-AUDIT-1: registrar tentativa (brute-force audit trail)
    prisma.loginAttempt.create({
      data: { email: validated.email, ipAddress, success: !error },
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
