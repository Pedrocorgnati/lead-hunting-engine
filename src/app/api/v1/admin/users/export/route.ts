/**
 * TASK-17 intake-review (CL-476): admin exporta lista de users em CSV,
 * respeitando filtros da URL (role, status).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'

const QuerySchema = z.object({
  role: z.enum(['ADMIN', 'OPERATOR']).optional(),
  status: z.enum(['active', 'deactivated']).optional(),
})

const HEADERS = ['id', 'email', 'name', 'role', 'status', 'createdAt', 'deactivatedAt']

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { role, status } = QuerySchema.parse(Object.fromEntries(searchParams))

    const where = {
      ...(role ? { role } : {}),
      ...(status === 'active' ? { deactivatedAt: null } : {}),
      ...(status === 'deactivated' ? { deactivatedAt: { not: null } } : {}),
    }

    const MAX_ROWS = 10_000
    const total = await prisma.userProfile.count({ where })
    const capped = Math.min(total, MAX_ROWS)
    const batchSize = 500
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(HEADERS.join(',') + '\n'))
        let skip = 0
        while (skip < capped) {
          const take = Math.min(batchSize, capped - skip)
          const rows = await prisma.userProfile.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take,
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              deactivatedAt: true,
            },
          })
          for (const r of rows) {
            const line =
              [
                r.id,
                r.email,
                r.name ?? '',
                r.role,
                r.deactivatedAt ? 'deactivated' : 'active',
                r.createdAt.toISOString(),
                r.deactivatedAt?.toISOString() ?? '',
              ]
                .map(escapeCsv)
                .join(',') + '\n'
            controller.enqueue(encoder.encode(line))
          }
          skip += take
        }
        controller.close()
      },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'audit_log.exported', // reutilizando action existente (comentario metadata distingue)
      resource: 'user_profile',
      metadata: { exported: 'users_csv', rows: capped, truncated: total > MAX_ROWS ? 1 : 0 },
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        undefined,
    })

    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
