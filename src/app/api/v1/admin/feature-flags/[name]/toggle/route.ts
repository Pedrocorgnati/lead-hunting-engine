import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { findFlag, setEnvValue } from '@/lib/feature-flags/repo'
import { auditChange } from '@/lib/feature-flags/audit'
import { unsafeFeatureFlagName } from '@/lib/feature-flags/types'
import type { JsonValue } from '@/lib/feature-flags/types'

/**
 * POST /api/v1/admin/feature-flags/[name]/toggle
 *
 * Inverte o valor booleano efetivo da flag no env informado (default
 * production): effective = envValues[env] ?? defaultValue; grava !effective.
 * Flags nao-booleanas retornam 422 (toggle so faz sentido para boolean).
 * Audit kind env_value_set. Auth: ADMIN. Item 044.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BodySchema = z.object({
  env: z.enum(['development', 'preview', 'production']).default('production'),
  reason: z.string().min(10).max(500).default('Toggle rapido via painel admin'),
})

interface RouteCtx {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const admin = await requireAdmin()
    const { name } = await ctx.params
    const body = BodySchema.parse(await request.json().catch(() => ({})))

    const before = await findFlag(unsafeFeatureFlagName(name))
    if (!before) {
      return NextResponse.json(
        { error: { code: 'FF_404', message: 'Flag nao encontrada.' } },
        { status: 404 }
      )
    }

    const envMap = (before.envValues ?? {}) as Record<string, JsonValue | null | undefined>
    const effective = envMap[body.env] ?? before.defaultValue
    if (typeof effective !== 'boolean') {
      return NextResponse.json(
        { error: { code: 'FF_422', message: 'Toggle disponivel apenas para flags booleanas.' } },
        { status: 422 }
      )
    }

    const after = await setEnvValue({
      flagId: before.id,
      env: body.env,
      value: !effective,
    })
    await auditChange({
      flagId: after.id,
      env: body.env,
      kind: 'env_value_set',
      beforeValue: effective as JsonValue,
      afterValue: !effective as JsonValue,
      reason: body.reason,
      user: { id: admin.id, email: admin.email },
    })

    return NextResponse.json({ data: { flag: after, enabled: !effective } })
  } catch (error) {
    return handleApiError(error)
  }
}
