import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { createFlag, listFlags } from '@/lib/feature-flags/repo'
import { auditChange } from '@/lib/feature-flags/audit'

/**
 * /api/v1/admin/feature-flags
 *
 * Cobre: TASK-3 (back-end do painel admin).
 *
 * GET    -> lista flags (filtros: ownerModule, tag, archived)
 * POST   -> cria flag nova (audit kind=created)
 *
 * Auth: ADMIN.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ListQuerySchema = z.object({
  ownerModule: z.string().optional(),
  tag: z.string().optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

const CreateSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  description: z.string().max(500).optional(),
  ownerModule: z.string().min(1).max(100),
  defaultValue: z.unknown(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  reason: z.string().min(10).max(500),
})

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const url = new URL(request.url)
    const query = ListQuerySchema.parse({
      ownerModule: url.searchParams.get('ownerModule') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      archived: url.searchParams.get('archived') ?? undefined,
    })
    const flags = await listFlags({
      ownerModule: query.ownerModule,
      tag: query.tag,
      archived: query.archived,
    })
    return NextResponse.json({ data: { flags } }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin()
    const body = CreateSchema.parse(await request.json())
    const flag = await createFlag({
      name: body.name,
      description: body.description,
      ownerModule: body.ownerModule,
      defaultValue: body.defaultValue,
      tags: body.tags,
      createdBy: admin.id,
    })
    await auditChange({
      flagId: flag.id,
      env: 'production',
      kind: 'created',
      beforeValue: null,
      afterValue: { name: flag.name, defaultValue: flag.defaultValue as never } as never,
      reason: body.reason,
      user: { id: admin.id, email: admin.email },
    })
    return NextResponse.json({ data: { flag } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
