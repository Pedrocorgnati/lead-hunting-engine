import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import {
  archiveFlag,
  findFlag,
  setEnvValue,
  updateFlag,
} from '@/lib/feature-flags/repo'
import { auditChange } from '@/lib/feature-flags/audit'
import { unsafeFeatureFlagName } from '@/lib/feature-flags/types'
import type { JsonValue } from '@/lib/feature-flags/types'

/**
 * /api/v1/admin/feature-flags/[name]
 *
 * Cobre: TASK-3 (back-end do painel admin).
 *
 * GET     -> detalhe da flag
 * PATCH   -> atualiza metadata (description/tags/defaultValue) -> audit metadata_updated
 * PUT     -> set/clear env value (toggle): body { env, value, reason } -> audit env_value_*
 * DELETE  -> archive (soft) -> audit deleted
 *
 * Auth: ADMIN.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PatchSchema = z.object({
  description: z.string().max(500).optional(),
  defaultValue: z.unknown().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  reason: z.string().min(10).max(500),
})

const EnvValueSchema = z.object({
  env: z.enum(['development', 'preview', 'production']),
  value: z.unknown(),
  reason: z.string().min(10).max(500),
})

const ArchiveSchema = z.object({ reason: z.string().min(10).max(500) })

interface RouteCtx {
  params: Promise<{ name: string }>
}

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    await requireAdmin()
    const { name } = await ctx.params
    const flag = await findFlag(unsafeFeatureFlagName(name))
    if (!flag) {
      return NextResponse.json(
        { error: { code: 'FF_404', message: 'Flag nao encontrada.' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: { flag } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const admin = await requireAdmin()
    const { name } = await ctx.params
    const body = PatchSchema.parse(await request.json())

    const before = await findFlag(unsafeFeatureFlagName(name))
    if (!before) {
      return NextResponse.json(
        { error: { code: 'FF_404', message: 'Flag nao encontrada.' } },
        { status: 404 }
      )
    }

    const after = await updateFlag(unsafeFeatureFlagName(name), {
      description: body.description,
      defaultValue: body.defaultValue,
      tags: body.tags,
    })
    const kind = body.defaultValue !== undefined ? 'updated_default' : 'metadata_updated'
    await auditChange({
      flagId: after.id,
      env: 'production',
      kind,
      beforeValue: {
        description: before.description ?? null,
        defaultValue: before.defaultValue as never,
        tags: before.tags,
      } as JsonValue,
      afterValue: {
        description: after.description ?? null,
        defaultValue: after.defaultValue as never,
        tags: after.tags,
      } as JsonValue,
      reason: body.reason,
      user: { id: admin.id, email: admin.email },
    })
    return NextResponse.json({ data: { flag: after } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, ctx: RouteCtx) {
  try {
    const admin = await requireAdmin()
    const { name } = await ctx.params
    const body = EnvValueSchema.parse(await request.json())

    const before = await findFlag(unsafeFeatureFlagName(name))
    if (!before) {
      return NextResponse.json(
        { error: { code: 'FF_404', message: 'Flag nao encontrada.' } },
        { status: 404 }
      )
    }
    const beforeMap = (before.envValues ?? {}) as Record<string, JsonValue | null | undefined>
    const beforeEnvValue = (beforeMap[body.env] ?? null) as JsonValue
    const after = await setEnvValue({
      flagId: before.id,
      env: body.env,
      value: body.value === null ? null : (body.value as JsonValue),
    })
    const kind = body.value === null ? 'env_value_cleared' : 'env_value_set'
    await auditChange({
      flagId: after.id,
      env: body.env,
      kind,
      beforeValue: beforeEnvValue,
      afterValue: (body.value === null ? null : (body.value as JsonValue)) as JsonValue,
      reason: body.reason,
      user: { id: admin.id, email: admin.email },
    })
    return NextResponse.json({ data: { flag: after } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const admin = await requireAdmin()
    const { name } = await ctx.params
    const body = ArchiveSchema.parse(await request.json())

    const before = await findFlag(unsafeFeatureFlagName(name))
    if (!before) {
      return NextResponse.json(
        { error: { code: 'FF_404', message: 'Flag nao encontrada.' } },
        { status: 404 }
      )
    }
    const after = await archiveFlag(unsafeFeatureFlagName(name))
    await auditChange({
      flagId: after.id,
      env: 'production',
      kind: 'deleted',
      beforeValue: { archivedAt: null } as JsonValue,
      afterValue: { archivedAt: after.archivedAt?.toISOString() ?? null } as JsonValue,
      reason: body.reason,
      user: { id: admin.id, email: admin.email },
    })
    return NextResponse.json({ data: { flag: after } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
