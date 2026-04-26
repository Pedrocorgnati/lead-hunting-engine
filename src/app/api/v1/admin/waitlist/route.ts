import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'

const ListQuerySchema = z.object({
  status: z.enum(['PENDING', 'INVITED', 'REJECTED']).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * GET /api/v1/admin/waitlist — TASK-3/ST004 (CL-313)
 * Lista WaitlistEntry com filtros status + busca por email + paginacao.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { status, q, page, limit } = ListQuerySchema.parse(
      Object.fromEntries(searchParams),
    )

    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [total, entries] = await Promise.all([
      prisma.waitlistEntry.count({ where }),
      prisma.waitlistEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return paginatedResponse(entries, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
