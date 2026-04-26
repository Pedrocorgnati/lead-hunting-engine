import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'

const ListQuerySchema = z.object({
  role: z.enum(['ADMIN', 'OPERATOR']).optional(),
  status: z.enum(['active', 'deactivated']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { role, status, page, limit } = ListQuerySchema.parse(Object.fromEntries(searchParams))

    const where = {
      ...(role ? { role } : {}),
      ...(status === 'active' ? { deactivatedAt: null } : {}),
      ...(status === 'deactivated' ? { deactivatedAt: { not: null } } : {}),
    }

    const [total, users] = await Promise.all([
      prisma.userProfile.count({ where }),
      prisma.userProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          deactivatedAt: true,
          createdAt: true,
        },
      }),
    ])

    return paginatedResponse(users, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
