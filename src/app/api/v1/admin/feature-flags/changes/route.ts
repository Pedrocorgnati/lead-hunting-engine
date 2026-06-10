import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { listChangesGlobal } from '@/lib/feature-flags/repo'

/**
 * GET /api/v1/admin/feature-flags/changes
 *
 * Timeline GLOBAL de auditoria de flags (item 044) — todas as flags, com
 * filtros env/kind/from/to/limit/cursor identicos ao per-flag.
 * Auth: ADMIN.
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

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const url = new URL(request.url)
    const q = QuerySchema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      env: url.searchParams.get('env') ?? undefined,
      kind: url.searchParams.get('kind') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    })
    const changes = await listChangesGlobal(q)
    return NextResponse.json({ data: { changes } })
  } catch (error) {
    return handleApiError(error)
  }
}
