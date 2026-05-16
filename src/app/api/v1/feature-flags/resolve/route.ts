import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import { resolveBatchInProvider } from '@/lib/feature-flags/provider'
import { unsafeFeatureFlagName } from '@/lib/feature-flags/types'
import { parseOverrideCookie, isOverrideAllowed } from '@/lib/feature-flags/cookie-override'
import type { FeatureFlagContext } from '@/lib/feature-flags/types'

/**
 * POST /api/v1/feature-flags/resolve
 *
 * Cobre: TASK-2/ST006, TASK-5/ST003 (CL-565).
 *
 * Resolve flags em batch para o usuario autenticado.
 * Em staging: cookie `ff_override` sobrescreve resolucao individual.
 * Em producao: cookie e ignorado silenciosamente.
 *
 * Auth: sessao obrigatoria.
 * Rate limit: 10 req/min por user.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OVERRIDE_COOKIE = 'ff_override'

const NameSchema = z
  .string()
  .min(3)
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)

const BodySchema = z.object({
  names: z.array(NameSchema).min(1).max(64),
  context: z
    .object({
      country: z.string().length(2).optional(),
      custom: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(
        { error: { code: 'AUTH_001', message: 'Sessao expirada. Faca login novamente.' } },
        { status: 401 }
      )
    }

    const ip = getClientIp(request)
    const rl = checkRateLimit(`ff:resolve:${user.id}:${ip}`, 10, 60)
    if (!rl.success) {
      return NextResponse.json(
        { error: { code: 'RATE_001', message: 'Muitas requisicoes.' } },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfter),
            'X-RateLimit-Reset': String(rl.reset),
          },
        }
      )
    }

    const body = BodySchema.parse(await request.json())
    const ctx: FeatureFlagContext = {
      userId: user.id,
      email: user.email,
      role: user.role,
      country: body.context?.country,
      custom: body.context?.custom as Record<string, never> | undefined,
    }
    const names = body.names.map((n) => unsafeFeatureFlagName(n))

    // Resolver via provider
    const providerFlags = await resolveBatchInProvider(names, ctx)

    // Aplicar overrides de cookie (staging/dev apenas — ignorado em prod)
    let flags = providerFlags
    if (isOverrideAllowed()) {
      const rawCookie = request.cookies.get(OVERRIDE_COOKIE)?.value
      const overrides = parseOverrideCookie(rawCookie)
      if (Object.keys(overrides).length > 0) {
        flags = { ...providerFlags }
        for (const name of names) {
          if (name in overrides) {
            flags[name] = overrides[name]
          }
        }
      }
    }

    return NextResponse.json(
      { data: { flags, resolved_at: new Date().toISOString() } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
