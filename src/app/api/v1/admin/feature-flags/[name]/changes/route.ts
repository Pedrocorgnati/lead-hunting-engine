import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { findFlag, listChanges } from '@/lib/feature-flags/repo'
import { unsafeFeatureFlagName } from '@/lib/feature-flags/types'

/**
 * GET /api/v1/admin/feature-flags/[name]/changes
 *
 * Cobre: TASK-3 (timeline de auditoria por flag).
 * Auth: ADMIN. RLS Postgres tambem valida em camada DB.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
  env: z.enum(['development', 'preview', 'production']).optional(),
  kind: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

interface RouteCtx {
  params: Promise<{ name: string }>
}

export async function GET(request: Request, ctx: RouteCtx) {
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
    const url = new URL(request.url)
    const q = QuerySchema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    })
    const changes = await listChanges(flag.id, { limit: q.limit, cursor: q.cursor, env: q.env, kind: q.kind, from: q.from, to: q.to })
    return NextResponse.json({ data: { changes } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
